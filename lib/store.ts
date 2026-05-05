/**
 * OMC-R Demo — in-memory mock data store + live alarm simulator.
 * Runs as a singleton in the Next.js server process.
 * Alarm generator fires every ~50 s; minor alarms auto-clear after ~8 min.
 */

let _booted = false;

export type SiteStatus   = "active" | "degraded" | "down";
export type AlarmSeverity = "critical" | "major" | "minor" | "warning" | "info";
export type AlarmStatus   = "active" | "acknowledged" | "cleared";

export interface Tower {
  id: string;
  name: string;
  location: string;
  city: string;
  state: string;
  status: SiteStatus;
  sectors: number;
  active_alarms?: number;
}

export interface Alarm {
  id: string;
  title: string;
  description: string;
  alarm_code: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  network_element: string;
  site_name: string;
  location: string;
  category: string;
  first_occurrence: string;
  last_occurrence: string;
  count: number;
  suggested_actions: string[];
}

export interface KpiPoint { timestamp: string; value: number }

export interface Kpi {
  id: string;
  metric: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  status: "ok" | "warning" | "critical";
  trend: KpiPoint[];
}

// ── Tower catalogue ──────────────────────────────────────────────────────────

export const TOWERS: Tower[] = [
  { id: "LAG-IKJ-001", name: "Ikeja North BTS",        location: "Ikeja",           city: "Lagos",         state: "Lagos",   sectors: 3, status: "active"   },
  { id: "LAG-VIS-002", name: "Victoria Island BTS",    location: "Victoria Island", city: "Lagos",         state: "Lagos",   sectors: 3, status: "active"   },
  { id: "LAG-LEK-003", name: "Lekki Phase 1 BTS",      location: "Lekki",           city: "Lagos",         state: "Lagos",   sectors: 3, status: "degraded" },
  { id: "LAG-SUR-004", name: "Surulere Central BTS",   location: "Surulere",        city: "Lagos",         state: "Lagos",   sectors: 6, status: "active"   },
  { id: "LAG-MSH-005", name: "Mushin Junction BTS",    location: "Mushin",          city: "Lagos",         state: "Lagos",   sectors: 3, status: "degraded" },
  { id: "LAG-OSH-006", name: "Oshodi Interchange BTS", location: "Oshodi",          city: "Lagos",         state: "Lagos",   sectors: 3, status: "active"   },
  { id: "ABJ-CBD-007", name: "CBD North BTS",          location: "CBD",             city: "Abuja",         state: "FCT",     sectors: 3, status: "active"   },
  { id: "ABJ-GAR-008", name: "Garki II BTS",           location: "Garki",           city: "Abuja",         state: "FCT",     sectors: 3, status: "active"   },
  { id: "ABJ-MAI-009", name: "Maitama BTS",            location: "Maitama",         city: "Abuja",         state: "FCT",     sectors: 3, status: "active"   },
  { id: "ABJ-WUS-010", name: "Wuse Zone 4 BTS",        location: "Wuse II",         city: "Abuja",         state: "FCT",     sectors: 3, status: "down"     },
  { id: "PHC-TRA-011", name: "Trans Amadi BTS",        location: "Trans Amadi",     city: "Port Harcourt", state: "Rivers",  sectors: 3, status: "active"   },
  { id: "PHC-RUM-012", name: "Rumuola Road BTS",       location: "Rumuola",         city: "Port Harcourt", state: "Rivers",  sectors: 6, status: "active"   },
  { id: "KAN-CBD-013", name: "Kano Central BTS",       location: "Kano Central",    city: "Kano",          state: "Kano",    sectors: 3, status: "active"   },
  { id: "KAN-NRT-014", name: "Kano North BTS",         location: "Fagge",           city: "Kano",          state: "Kano",    sectors: 3, status: "degraded" },
  { id: "IBD-CBD-015", name: "Ibadan Ring Road BTS",   location: "Ring Road",       city: "Ibadan",        state: "Oyo",     sectors: 3, status: "active"   },
  { id: "ENU-GRA-016", name: "Enugu GRA BTS",          location: "GRA",             city: "Enugu",         state: "Enugu",   sectors: 3, status: "active"   },
  { id: "BEN-CBD-017", name: "Benin Ring Road BTS",    location: "Ring Road",       city: "Benin City",    state: "Edo",     sectors: 6, status: "active"   },
  { id: "KAD-CBD-018", name: "Kaduna Central BTS",     location: "Kawo",            city: "Kaduna",        state: "Kaduna",  sectors: 3, status: "active"   },
  { id: "ABA-CBD-019", name: "Aba Central BTS",        location: "Aba",             city: "Aba",           state: "Abia",    sectors: 3, status: "degraded" },
  { id: "OWR-CBD-020", name: "Owerri Central BTS",     location: "Owerri",          city: "Owerri",        state: "Imo",     sectors: 3, status: "active"   },
];

// ── Alarm templates ──────────────────────────────────────────────────────────

interface Template {
  code: string;
  title: string;
  desc: (name: string, loc: string) => string;
  severity: AlarmSeverity;
  category: string;
  actions: string[];
}

const TEMPLATES: Template[] = [
  {
    code: "VSWR_0001", title: "VSWR Alarm — Antenna Fault",
    desc: (n, l) => `Voltage Standing Wave Ratio exceeded threshold on ${n} (${l}). VSWR: 3.2 (limit: 2.5). Possible feeder cable damage or loose connector on Sector 1.`,
    severity: "major", category: "RF Hardware",
    actions: [
      "Dispatch field engineer for antenna and feeder inspection",
      "Check all feeder cable connections at tower base and antenna port",
      "Measure VSWR manually with spectrum analyser to confirm",
      "Replace damaged feeder cable if fault is confirmed",
    ],
  },
  {
    code: "CELL_OOS_001", title: "Cell Out of Service",
    desc: (n, l) => `Cell on ${n} (${l}) is completely out of service. All sectors unresponsive. Baseband unit failed last heartbeat check. Estimated ${Math.floor(Math.random() * 8000 + 2000).toLocaleString()} subscribers affected.`,
    severity: "critical", category: "Cell Availability",
    actions: [
      "Check baseband unit (BBU) status and attempt remote reboot",
      "Verify power supply continuity to equipment room",
      "Check backhaul link status — re-establish if down",
      "Escalate to NOC Level 2 if not resolved within 15 minutes",
    ],
  },
  {
    code: "INTF_HIGH_001", title: "High Uplink Interference",
    desc: (n, l) => `Uplink interference at ${n} (${l}), Sector 2. Noise floor elevated 12 dB above thermal. Carrier-to-interference ratio: −4 dB. Estimated 3,800 affected subscribers.`,
    severity: "major", category: "RF Performance",
    actions: [
      "Run automated interference detection scan",
      "Coordinate with frequency team for PRB reallocation",
      "Investigate for illegal repeater installations nearby",
      "Apply uplink interference rejection filter if supported",
    ],
  },
  {
    code: "PWR_MOD_001", title: "Rectifier Module Fault",
    desc: (n, l) => `Rectifier fault at ${n} (${l}). Module 3 of 4 failed. Remaining modules at 133% rated capacity. Risk of cascade failure if load is not reduced.`,
    severity: "major", category: "Power",
    actions: [
      "Replace faulty rectifier module as soon as possible",
      "Monitor remaining modules for thermal overload",
      "Ensure battery backup is fully charged",
      "Reduce non-essential site load until repair is complete",
    ],
  },
  {
    code: "BHL_DEG_001", title: "Backhaul Link Degraded",
    desc: (n, l) => `Microwave backhaul to ${n} (${l}) has 4.2% packet loss. Throughput at 67% of licensed capacity. Latency: 28 ms (normal: 8 ms). Rain fade suspected.`,
    severity: "warning", category: "Transmission",
    actions: [
      "Check microwave dish alignment — possible obstruction or misalignment",
      "Review link budget for this hop",
      "Investigate rain fade / atmospheric ducting effects",
      "Activate backup fibre path if available",
    ],
  },
  {
    code: "TEMP_HIGH_001", title: "Equipment Room — High Temperature",
    desc: (n, l) => `Equipment room at ${n} (${l}) reached 47°C (threshold: 40°C). Precision AC Unit 1 appears to have failed. Thermal shutdown risk within 20 minutes.`,
    severity: "major", category: "Environmental",
    actions: [
      "Dispatch technician immediately to inspect AC units",
      "Open ventilation louvers as emergency measure",
      "Check AC fault codes and attempt restart",
      "Prepare controlled shutdown if temperature continues rising",
    ],
  },
  {
    code: "BATT_LOW_001", title: "Battery Backup — Low State of Charge",
    desc: (n, l) => `Battery at ${n} (${l}) at 18% charge. Site on generator power for 6+ hours. Grid power not restored. Estimated autonomy: 2 hours at current load.`,
    severity: "warning", category: "Power",
    actions: [
      "Contact distribution company (DISCO) for grid restoration ETA",
      "Arrange urgent diesel refuel — generator tank running low",
      "Check battery cell health and replace degraded cells",
      "Prepare controlled shutdown procedure if backup runs out",
    ],
  },
  {
    code: "HO_FAIL_001", title: "Handover Failure Rate — SLA Breach",
    desc: (n, l) => `Handover failure rate at ${n} (${l}): 7.8% against SLA of 3.0%. Both intra-frequency and inter-frequency HOs affected. Subscriber call-drop rate elevated.`,
    severity: "warning", category: "Mobility",
    actions: [
      "Review A3 offset and Time-to-Trigger handover parameters",
      "Audit for pilot pollution from adjacent cells",
      "Verify neighbour cell list completeness",
      "Schedule drive test to identify coverage holes at cell boundary",
    ],
  },
  {
    code: "RRC_FAIL_001", title: "RRC Setup Failure Rate — SLA Breach",
    desc: (n, l) => `RRC Setup Failure Rate at ${n} (${l}): 2.4% (SLA limit: 1.0%). Approximately 1,200 failed connection attempts per hour. Access congestion suspected.`,
    severity: "major", category: "Access",
    actions: [
      "Check PRACH configuration and preamble format settings",
      "Review admission control thresholds and capacity limits",
      "Increase RACH root sequence index to reduce collision probability",
      "Analyse cell-edge coverage — possible signal hole causing failures",
    ],
  },
  {
    code: "FIBER_CUT_001", title: "Fibre Backhaul — Link Down",
    desc: (n, l) => `Fibre backhaul to ${n} (${l}) is completely down. External cable cut suspected on this route segment. Site auto-switched to microwave backup (85% capacity).`,
    severity: "critical", category: "Transmission",
    actions: [
      "Contact fibre provider NOC with OTDR fault location data",
      "Confirm microwave backup is active and passing traffic",
      "Dispatch fibre splicing team to identified fault location",
      "Monitor microwave link utilisation — congestion management may be needed",
    ],
  },
  {
    code: "DISC_ANOM_001", title: "Abnormal Disconnect Rate",
    desc: (n, l) => `Abnormal disconnect rate at ${n} (${l}): 8.3/min (baseline: 1.2/min). Pattern consistent with RF degradation or BBU hardware fault. Immediate investigation required.`,
    severity: "critical", category: "Call Quality",
    actions: [
      "Cross-check adjacent cells for the same anomaly pattern",
      "Review hardware alarm correlation log for this site",
      "Check uplink SINR distribution for degradation indicators",
      "Initiate Level 2 emergency performance investigation procedure",
    ],
  },
  {
    code: "TPUT_SLA_001", title: "Downlink Throughput Below SLA",
    desc: (n, l) => `Average downlink throughput at ${n} (${l}): 4.2 Mbps (SLA target: 8 Mbps). Peak-hour congestion across all sectors. PRB utilisation at 94%.`,
    severity: "warning", category: "Performance",
    actions: [
      "Activate carrier aggregation on available spectrum bands",
      "Review scheduler QoS configuration and prioritisation",
      "Consider small-cell deployment to offload high-density areas",
      "Raise a capacity planning request for this site",
    ],
  },
];

// ── Store state ──────────────────────────────────────────────────────────────

let _seq = 1000;
const _alarms: Alarm[] = [];
let _kpis: Kpi[] = [];
const _events: { id: string; timestamp: string; message: string; severity: AlarmSeverity }[] = [];
let _simulatorActive = true;
let _startedAt = new Date().toISOString();

function _rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _trend(base: number, variance: number, n = 24): KpiPoint[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const ts = new Date(now - (n - 1 - i) * 3_600_000);
    const v = base + (Math.random() - 0.5) * variance * 2;
    return { timestamp: ts.toISOString(), value: parseFloat(v.toFixed(2)) };
  });
}

function _seedKpis() {
  _kpis = [
    { id: "csr",   metric: "call_success_rate",     label: "Call Success Rate",    value: 98.1, unit: "%",   target: 98.5, status: "warning", trend: _trend(98.1, 0.8) },
    { id: "hsr",   metric: "handover_success_rate", label: "Handover Success Rate",value: 96.4, unit: "%",   target: 97.0, status: "warning", trend: _trend(96.4, 1.2) },
    { id: "rrc",   metric: "rrc_success_rate",      label: "RRC Setup Success",    value: 99.2, unit: "%",   target: 99.0, status: "ok",      trend: _trend(99.2, 0.4) },
    { id: "avail", metric: "network_availability",  label: "Network Availability", value: 99.1, unit: "%",   target: 99.5, status: "warning", trend: _trend(99.1, 0.3) },
    { id: "cssr",  metric: "cssr",                  label: "CSSR",                 value: 97.8, unit: "%",   target: 97.5, status: "ok",      trend: _trend(97.8, 0.6) },
    { id: "rssi",  metric: "avg_rssi",              label: "Avg Signal Strength",  value: -78,  unit: "dBm", target: -75,  status: "warning", trend: _trend(-78, 3)    },
  ];
}

function _makeAlarm(tIdx?: number): Alarm {
  const tower  = tIdx !== undefined ? TOWERS[tIdx] : _rand(TOWERS);
  const tmpl   = _rand(TEMPLATES);
  const now    = new Date();
  const ago    = Math.random() * 7_200_000;
  return {
    id:               `OMCR-${++_seq}`,
    title:            tmpl.title,
    description:      tmpl.desc(tower.name, tower.location),
    alarm_code:       tmpl.code,
    severity:         tmpl.severity,
    status:           "active",
    network_element:  tower.id,
    site_name:        tower.name,
    location:         `${tower.location}, ${tower.city}`,
    category:         tmpl.category,
    first_occurrence: new Date(now.getTime() - ago).toISOString(),
    last_occurrence:  new Date(now.getTime() - ago / 2).toISOString(),
    count:            Math.floor(Math.random() * 20) + 1,
    suggested_actions: tmpl.actions,
  };
}

function _recordEvent(message: string, severity: AlarmSeverity = "info") {
  _events.unshift({
    id: `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    message,
    severity,
  });
  if (_events.length > 40) _events.pop();
}

function _seedAlarms() {
  // Fixed seed pairs [towerIdx, templateIdx] for a deterministic initial state
  const pairs: [number, number][] = [
    [9,  1],  // Wuse: Cell OOS (critical)
    [1,  9],  // Victoria Island: Fibre Cut (critical)
    [10, 10], // Trans Amadi: Disconnect anomaly (critical)
    [2,  0],  // Lekki: VSWR (major)
    [4,  5],  // Mushin: Temp high (major)
    [13, 4],  // Kano North: Backhaul degraded (warning)
    [18, 6],  // Aba: Battery low (warning)
    [6,  7],  // CBD Abuja: HO failure (warning)
    [11, 8],  // Rumuola: RRC failure (major)
    [3,  3],  // Surulere: Power module (major)
    [16, 2],  // Benin: High interference (major)
    [0,  9],  // Ikeja: Fibre cut (critical)
  ];
  for (const [ti, tpi] of pairs) {
    const tower = TOWERS[ti];
    const tmpl  = TEMPLATES[tpi];
    const now   = new Date();
    const ago   = Math.random() * 5_400_000;
    _alarms.push({
      id:               `OMCR-${++_seq}`,
      title:            tmpl.title,
      description:      tmpl.desc(tower.name, tower.location),
      alarm_code:       tmpl.code,
      severity:         tmpl.severity,
      status:           "active",
      network_element:  tower.id,
      site_name:        tower.name,
      location:         `${tower.location}, ${tower.city}`,
      category:         tmpl.category,
      first_occurrence: new Date(now.getTime() - ago).toISOString(),
      last_occurrence:  new Date(now.getTime() - ago / 2).toISOString(),
      count:            Math.floor(Math.random() * 30) + 1,
      suggested_actions: tmpl.actions,
    });
  }
}

export function boot() {
  if (_booted) return;
  _booted = true;
  _seedKpis();
  _seedAlarms();

  // New alarm every ~50 s (cap at 20 active)
  setInterval(() => {
    if (_simulatorActive && _alarms.filter(a => a.status === "active").length < 20) {
      const alarm = _makeAlarm();
      _alarms.push(alarm);
      _recordEvent(`Inbound alarm ${alarm.id} received from ${alarm.network_element}`, alarm.severity);
    }
  }, 50_000);

  // Auto-clear some warning/minor alarms every 2 min
  setInterval(() => {
    const cutoff = Date.now() - 8 * 60_000;
    for (const a of _alarms) {
      if (_simulatorActive && a.status === "active" && ["warning", "minor", "info"].includes(a.severity)) {
        if (new Date(a.first_occurrence).getTime() < cutoff && Math.random() < 0.3) {
          a.status = "cleared";
          a.last_occurrence = new Date().toISOString();
          _recordEvent(`Alarm ${a.id} auto-cleared after stabilization`, a.severity);
        }
      }
    }
  }, 120_000);

  // Gently fluctuate KPIs every 30 s
  setInterval(() => {
    for (const k of _kpis) {
      const delta = _simulatorActive ? (Math.random() - 0.5) * 0.3 : 0;
      k.value = parseFloat((k.value + delta).toFixed(2));
      k.trend.push({ timestamp: new Date().toISOString(), value: k.value });
      if (k.trend.length > 48) k.trend.shift();
      k.status = k.unit === "dBm"
        ? k.value >= k.target ? "ok" : k.value >= k.target - 5 ? "warning" : "critical"
        : k.value >= k.target ? "ok" : k.value >= k.target - 1.5 ? "warning" : "critical";
    }
  }, 30_000);
}

// Auto-boot when the module is first imported by any API route
boot();

// ── Public read API ──────────────────────────────────────────────────────────

export function getAlarms(opts: { status?: string; severity?: string; limit?: number } = {}): Alarm[] {
  const SEV_ORDER: Record<string, number> = { critical: 0, major: 1, minor: 2, warning: 3, info: 4 };
  let result = [..._alarms];
  if (opts.status)   result = result.filter(a => a.status === opts.status);
  if (opts.severity) result = result.filter(a => a.severity === opts.severity);
  result.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
  return result.slice(0, opts.limit ?? 200);
}

export function getTowers(): (Tower & { active_alarms: number })[] {
  return TOWERS.map(t => ({
    ...t,
    active_alarms: _alarms.filter(a => a.network_element === t.id && a.status === "active").length,
  }));
}

export function getKpis(): Kpi[] { return _kpis; }

export function getStats() {
  const active = _alarms.filter(a => a.status === "active");
  const towers = getTowers();
  return {
    total_sites:         TOWERS.length,
    sites_active:        towers.filter(t => t.status === "active").length,
    sites_degraded:      towers.filter(t => t.status === "degraded").length,
    sites_down:          towers.filter(t => t.status === "down").length,
    alarms_critical:     active.filter(a => a.severity === "critical").length,
    alarms_major:        active.filter(a => a.severity === "major").length,
    alarms_warning:      active.filter(a => a.severity === "warning").length,
    alarms_info:         active.filter(a => a.severity === "info").length,
    total_active_alarms: active.length,
    network_health:      parseFloat((_kpis.find(k => k.id === "avail")?.value ?? 99.0).toFixed(1)),
  };
}

export function getSimulatorState() {
  return {
    active: _simulatorActive,
    started_at: _startedAt,
    uptime_seconds: Math.max(0, Math.floor((Date.now() - new Date(_startedAt).getTime()) / 1000)),
    poll_interval_seconds: 5,
    alarm_generation_seconds: 50,
    source: "MTN Nigeria OMC-R Demo Feed",
    events: _events,
  };
}

export function setSimulatorActive(active: boolean) {
  if (active && !_simulatorActive) {
    _startedAt = new Date().toISOString();
    _recordEvent("OMC-R simulator feed connected", "info");
  }
  if (!active && _simulatorActive) {
    _recordEvent("OMC-R simulator feed paused", "warning");
  }
  _simulatorActive = active;
  return getSimulatorState();
}

export function generateAlarmNow(): Alarm {
  const alarm = _makeAlarm();
  _alarms.unshift(alarm);
  _recordEvent(`Manual poll generated ${alarm.id} from ${alarm.network_element}`, alarm.severity);
  return alarm;
}

export function getSnapshot() {
  return {
    simulator: getSimulatorState(),
    stats: getStats(),
    towers: getTowers(),
    alarms: getAlarms({ status: "active", limit: 50 }),
    kpis: getKpis(),
    updated_at: new Date().toISOString(),
  };
}

export function acknowledgeAlarm(id: string): boolean {
  const a = _alarms.find(a => a.id === id);
  if (!a || a.status !== "active") return false;
  a.status = "acknowledged";
  _recordEvent(`Alarm ${id} acknowledged by OMC-R operator`, a.severity);
  return true;
}

export function clearAlarm(id: string): boolean {
  const a = _alarms.find(a => a.id === id);
  if (!a) return false;
  a.status = "cleared";
  a.last_occurrence = new Date().toISOString();
  _recordEvent(`Alarm ${id} cleared by OMC-R operator`, a.severity);
  return true;
}
