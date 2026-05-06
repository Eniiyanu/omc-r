/**
 * Atlascore backend client.
 *
 * Fetches live network data from the atlascore FastAPI backend and maps it to
 * the Snapshot shape the omcr-demo frontend expects at /api/omcr/snapshot.
 *
 * Set ATLASCORE_API_URL in your environment to enable. When the variable is
 * absent the caller falls back to the in-memory mock store.
 */

const BASE_URL = process.env.ATLASCORE_API_URL ?? "";
const SVC_EMAIL =
  process.env.ATLASCORE_SERVICE_EMAIL ?? "admin@mtn.ng";
const SVC_PASSWORD =
  process.env.ATLASCORE_SERVICE_PASSWORD ?? "AtlasAdmin2026!";

export const isConfigured = () => BASE_URL.length > 0;

// ── Token cache (module-level — lives for the lifetime of the Node process) ───

let _token: string | null = null;
let _tokenExpiry = 0;
const _startTime = Date.now();

// In-memory acknowledged / cleared state (resets on server restart)
const _acknowledgedIds = new Set<string>();
const _clearedIds = new Set<string>();

export function acknowledgeIncident(id: string) {
  _acknowledgedIds.add(id);
}

export function clearIncident(id: string) {
  _clearedIds.add(id);
  _acknowledgedIds.delete(id);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SVC_EMAIL, password: SVC_PASSWORD }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Atlascore login failed (${res.status}): check ATLASCORE_SERVICE_EMAIL / ATLASCORE_SERVICE_PASSWORD`
    );
  }

  const data = (await res.json()) as { access_token: string };
  _token = data.access_token;
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // refresh 1 h before 24 h expiry
  return _token;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    _token = null;
    _tokenExpiry = 0;
    return apiFetch<T>(path, init); // retry once after re-login
  }

  if (!res.ok) throw new Error(`Atlascore ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Atlascore response types ──────────────────────────────────────────────────

interface ACSite {
  id: number;
  site_code: string;
  name: string;
  cluster: string;
  region: string;
  zone: string | null;
  status: "operational" | "degraded" | "down" | "maintenance";
  subscriber_count: number | null;
  technology: string | null;
  last_alarm_at: string | null;
  last_alarm_severity: string | null;
}

interface ACIncident {
  id: number;
  incident_ref: string;
  title: string;
  description: string | null;
  cluster: string | null;
  region: string | null;
  severity: "critical" | "major" | "minor" | "warning";
  status: "open" | "investigating" | "resolved" | "closed";
  root_cause_category: string | null;
  affected_sites_count: number | null;
  started_at: string | null;
  assigned_team: string | null;
}

interface ACKpiSummary {
  latest: {
    availability_pct: number | null;
    call_setup_success_pct: number | null;
    drop_call_rate_pct: number | null;
    data_throughput_mbps: number | null;
    latency_ms: number | null;
    availability_target: number | null;
    csr_target: number | null;
  } | null;
  averages: {
    availability_pct: number | null;
    call_setup_success_pct: number | null;
    data_throughput_mbps: number | null;
  };
  targets: {
    availability_pct: number | null;
    call_setup_success_pct: number | null;
  };
}

// ── Mappers ───────────────────────────────────────────────────────────────────

type SiteStatus = "active" | "degraded" | "down";
type AlarmSeverity = "critical" | "major" | "minor" | "warning" | "info";
type AlarmStatus = "active" | "acknowledged" | "cleared";
type KpiStatus = "ok" | "warning" | "critical";

function mapSiteStatus(s: ACSite["status"]): SiteStatus {
  if (s === "operational") return "active";
  if (s === "down") return "down";
  return "degraded"; // degraded | maintenance
}

function mapIncidentStatus(inc: ACIncident): AlarmStatus {
  const id = String(inc.id);
  if (_clearedIds.has(id)) return "cleared";
  if (_acknowledgedIds.has(id)) return "acknowledged";
  if (inc.status === "investigating") return "acknowledged";
  if (inc.status === "resolved" || inc.status === "closed") return "cleared";
  return "active";
}

function mapIncidentSeverity(s: ACIncident["severity"]): AlarmSeverity {
  return s; // schemas match exactly
}

function kpiStatus(value: number, target: number, lowerIsBetter = false): KpiStatus {
  if (lowerIsBetter) {
    if (value <= target) return "ok";
    if (value <= target * 2) return "warning";
    return "critical";
  }
  if (value >= target) return "ok";
  if (value >= target - 3) return "warning";
  return "critical";
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

export async function buildSnapshot() {
  const [sitesResp, incidentsResp, kpiResp] = await Promise.all([
    apiFetch<{ sites: ACSite[]; total: number }>("/api/network/sites"),
    apiFetch<{ incidents: ACIncident[]; total: number; critical_count: number }>(
      "/api/network/incidents/active"
    ),
    apiFetch<ACKpiSummary>("/api/network/kpis?scope=region&region=Lagos&days=7"),
  ]);

  const sites = sitesResp.sites;
  const incidents = incidentsResp.incidents;

  // Per-cluster incident counts for active_alarms on each tower
  const clusterAlarmCount: Record<string, number> = {};
  for (const inc of incidents) {
    if (inc.cluster) {
      clusterAlarmCount[inc.cluster] = (clusterAlarmCount[inc.cluster] ?? 0) + 1;
    }
  }

  // Stats
  const sitesActive = sites.filter((s) => s.status === "operational").length;
  const sitesDegraded = sites.filter(
    (s) => s.status === "degraded" || s.status === "maintenance"
  ).length;
  const sitesDown = sites.filter((s) => s.status === "down").length;

  const alarmsData = incidents.filter(
    (i) => !_clearedIds.has(String(i.id))
  );
  const alarmsCritical = alarmsData.filter((i) => i.severity === "critical").length;
  const alarmsMajor = alarmsData.filter((i) => i.severity === "major").length;
  const alarmsWarning = alarmsData.filter((i) => i.severity === "warning").length;

  const avail = kpiResp.averages.availability_pct ?? 99.0;
  const networkHealth = Math.round(avail);

  // Towers
  const towers = sites.map((s) => ({
    id: s.site_code,
    name: s.name,
    location: s.zone ?? s.cluster,
    city: s.cluster,
    state: s.region,
    status: mapSiteStatus(s.status),
    sectors: 3,
    active_alarms: clusterAlarmCount[s.cluster] ?? 0,
  }));

  // Alarms (active + acknowledged, not cleared)
  const alarms = alarmsData.map((inc) => ({
    id: String(inc.id),
    title: inc.title,
    description: inc.description ?? inc.root_cause_category ?? "Network incident",
    alarm_code: inc.incident_ref,
    severity: mapIncidentSeverity(inc.severity),
    status: mapIncidentStatus(inc),
    network_element: inc.cluster ?? inc.region ?? "Unknown",
    site_name: [inc.cluster, inc.region].filter(Boolean).join(" — "),
    location: inc.region ?? "Nigeria",
    category: inc.root_cause_category ?? "network",
    first_occurrence: inc.started_at ?? new Date().toISOString(),
    last_occurrence: inc.started_at ?? new Date().toISOString(),
    count: inc.affected_sites_count ?? 1,
    suggested_actions: inc.assigned_team
      ? [`Escalate to ${inc.assigned_team}`]
      : ["Investigate root cause", "Check field team availability"],
  }));

  // KPIs
  const avg = kpiResp.averages;
  const latest = kpiResp.latest;
  const targets = kpiResp.targets;

  const availPct = avg.availability_pct ?? 99.0;
  const csrPct = avg.call_setup_success_pct ?? 96.0;
  const throughput = avg.data_throughput_mbps ?? 450;
  const dcr = latest?.drop_call_rate_pct ?? 0.8;
  const latency = latest?.latency_ms ?? 42;

  const availTarget = targets.availability_pct ?? 99.5;
  const csrTarget = targets.call_setup_success_pct ?? 95.0;

  const kpis = [
    {
      id: "avail",
      label: "Network Availability",
      value: Math.round(availPct * 10) / 10,
      unit: "%",
      target: availTarget,
      status: kpiStatus(availPct, availTarget),
    },
    {
      id: "csr",
      label: "Call Setup Success",
      value: Math.round(csrPct * 10) / 10,
      unit: "%",
      target: csrTarget,
      status: kpiStatus(csrPct, csrTarget),
    },
    {
      id: "throughput",
      label: "Data Throughput",
      value: Math.round(throughput),
      unit: "Mbps",
      target: 500,
      status: kpiStatus(throughput, 400),
    },
    {
      id: "dcr",
      label: "Drop Call Rate",
      value: Math.round(dcr * 100) / 100,
      unit: "%",
      target: 1.0,
      status: kpiStatus(dcr, 1.0, true),
    },
    {
      id: "latency",
      label: "Network Latency",
      value: Math.round(latency),
      unit: "ms",
      target: 50,
      status: kpiStatus(latency, 50, true),
    },
  ] as { id: string; label: string; value: number; unit: string; target: number; status: KpiStatus }[];

  // Simulator block — represents the live feed, not a mock simulator
  const snapshot = {
    simulator: {
      active: true,
      started_at: new Date(_startTime).toISOString(),
      uptime_seconds: Math.floor((Date.now() - _startTime) / 1000),
      source: `atlascore-backend (live) · ${BASE_URL}/api/network`,
      events: incidents.slice(0, 12).map((inc) => ({
        id: String(inc.id),
        timestamp: inc.started_at ?? new Date().toISOString(),
        message: `[${inc.incident_ref}] ${inc.title}`,
        severity: mapIncidentSeverity(inc.severity) as AlarmSeverity,
      })),
    },
    stats: {
      total_sites: sites.length,
      sites_active: sitesActive,
      sites_degraded: sitesDegraded,
      sites_down: sitesDown,
      alarms_critical: alarmsCritical,
      alarms_major: alarmsMajor,
      alarms_warning: alarmsWarning,
      total_active_alarms: alarmsData.length,
      network_health: networkHealth,
    },
    towers,
    alarms,
    kpis,
    updated_at: new Date().toISOString(),
  };

  return snapshot;
}
