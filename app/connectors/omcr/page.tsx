"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Signal,
  X,
} from "lucide-react";

type SiteStatus = "active" | "degraded" | "down";
type AlarmSeverity = "critical" | "major" | "minor" | "warning" | "info";
type AlarmStatus = "active" | "acknowledged" | "cleared";

interface Tower {
  id: string;
  name: string;
  location: string;
  city: string;
  state: string;
  status: SiteStatus;
  sectors: number;
  active_alarms: number;
}

interface Alarm {
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

interface Kpi {
  id: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  status: "ok" | "warning" | "critical";
}

interface Snapshot {
  simulator: {
    active: boolean;
    started_at: string;
    uptime_seconds: number;
    source: string;
    events: { id: string; timestamp: string; message: string; severity: AlarmSeverity }[];
  };
  stats: {
    total_sites: number;
    sites_active: number;
    sites_degraded: number;
    sites_down: number;
    alarms_critical: number;
    alarms_major: number;
    alarms_warning: number;
    total_active_alarms: number;
    network_health: number;
  };
  towers: Tower[];
  alarms: Alarm[];
  kpis: Kpi[];
  updated_at: string;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function kpiPercent(kpi: Kpi) {
  if (kpi.unit === "dBm") {
    return Math.max(8, Math.min(100, ((kpi.value + 110) / 45) * 100));
  }
  return Math.max(8, Math.min(100, kpi.value));
}

export default function OmcrConnectorPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | AlarmSeverity>("all");

  const loadSnapshot = useCallback(async () => {
    const res = await fetch("/api/omcr/snapshot", { cache: "no-store" });
    if (!res.ok) throw new Error("Unable to load OMC-R snapshot");
    const data = (await res.json()) as Snapshot;
    setSnapshot(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const firstLoadId = window.setTimeout(() => void loadSnapshot(), 0);
    const intervalId = window.setInterval(() => void loadSnapshot(), 5000);
    return () => {
      window.clearTimeout(firstLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadSnapshot]);

  const toggleSimulator = async () => {
    if (!snapshot) return;
    setBusy(true);
    await fetch("/api/omcr/simulator", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !snapshot.simulator.active }),
    });
    await loadSnapshot();
    setBusy(false);
  };

  const generateAlarm = async () => {
    setBusy(true);
    await fetch("/api/omcr/alarms", { method: "POST" });
    await loadSnapshot();
    setBusy(false);
  };

  const updateAlarm = async (id: string, action: "acknowledge" | "clear") => {
    await fetch(`/api/omcr/alarms/${id}/${action}`, { method: "PATCH" });
    await loadSnapshot();
  };

  const alarms = useMemo(() => {
    const list = snapshot?.alarms ?? [];
    return filter === "all" ? list : list.filter((alarm) => alarm.severity === filter);
  }, [filter, snapshot]);

  if (loading || !snapshot) {
    return (
      <main className="shell">
        <div className="empty">Loading OMC-R simulator...</div>
      </main>
    );
  }

  const severityFilters: ("all" | AlarmSeverity)[] = ["all", "critical", "major", "warning"];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">OM</div>
          <div>
            <p className="eyebrow">MTN Nigeria OMC-R Feed</p>
            <h1 className="title">Radio Access Network Operations Console</h1>
          </div>
        </div>

        <div className="toolbar">
          <span className={`badge ${snapshot.simulator.active ? "active" : "warning"}`}>
            {snapshot.simulator.active ? "Simulator live" : "Simulator paused"}
          </span>
          <button className="btn" onClick={() => void loadSnapshot()} title="Refresh snapshot">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="btn" onClick={() => void generateAlarm()} disabled={busy} title="Generate alarm">
            <ShieldAlert size={16} />
            Inject Alarm
          </button>
          <button
            className={`btn ${snapshot.simulator.active ? "danger" : "primary"}`}
            onClick={() => void toggleSimulator()}
            disabled={busy}
            title={snapshot.simulator.active ? "Pause simulator" : "Start simulator"}
          >
            {snapshot.simulator.active ? <Pause size={16} /> : <Play size={16} />}
            {snapshot.simulator.active ? "Pause Feed" : "Start Feed"}
          </button>
        </div>
      </header>

      <section className="stats">
        <div className="panel stat">
          <strong>{snapshot.stats.total_sites}</strong>
          <span>Total sites monitored</span>
        </div>
        <div className="panel stat">
          <strong>{snapshot.stats.network_health}%</strong>
          <span>Network availability</span>
        </div>
        <div className="panel stat">
          <strong>{snapshot.stats.total_active_alarms}</strong>
          <span>Active alarms</span>
        </div>
        <div className="panel stat">
          <strong>{snapshot.stats.alarms_critical}</strong>
          <span>Critical incidents</span>
        </div>
        <div className="panel stat">
          <strong>{formatDuration(snapshot.simulator.uptime_seconds)}</strong>
          <span>Feed uptime</span>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Tower Grid</h2>
              <p className="panel-sub">20 simulated BTS/eNodeB sites across Lagos, Abuja, Kano, Rivers and other regions</p>
            </div>
            <RadioTower size={18} color="#667085" />
          </div>
          <div className="tower-grid">
            {snapshot.towers.map((tower) => (
              <div key={tower.id} className={`tower ${tower.status}`}>
                <div className="tower-id">{tower.id}</div>
                <div className="tower-name">{tower.name}</div>
                <div className="tower-meta">
                  <span>{tower.city}</span>
                  <span className={`badge ${tower.status}`}>{tower.status}</span>
                </div>
                <div className="tower-meta" style={{ marginTop: 8 }}>
                  <span>{tower.sectors} sectors</span>
                  <span>{tower.active_alarms} alarms</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">KPI Gauges</h2>
              <p className="panel-sub">Live radio, mobility and service quality indicators</p>
            </div>
            <Signal size={18} color="#667085" />
          </div>
          <div className="kpis">
            {snapshot.kpis.map((kpi) => (
              <div key={kpi.id} className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">{kpi.label}</span>
                  <span className={`badge ${kpi.status}`}>{kpi.status}</span>
                </div>
                <div className="kpi-value">
                  {kpi.value}
                  <span style={{ fontSize: 13, color: "#667085", marginLeft: 4 }}>{kpi.unit}</span>
                </div>
                <div className={`bar ${kpi.status}`} style={{ marginTop: 12 }}>
                  <span style={{ width: `${kpiPercent(kpi)}%` }} />
                </div>
                <div className="tower-meta" style={{ marginTop: 8 }}>
                  <span>Target</span>
                  <span>
                    {kpi.target}
                    {kpi.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Live Alarm Table</h2>
              <p className="panel-sub">Auto-refreshing OMC-R fault stream, sorted by operational severity</p>
            </div>
            <div className="toolbar">
              {severityFilters.map((item) => (
                <button
                  key={item}
                  className={`btn ${filter === item ? "primary" : ""}`}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="table-scroll">
            <table className="alarm-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Alarm</th>
                  <th>Site</th>
                  <th>Category</th>
                  <th>Last Seen</th>
                  <th>Ops</th>
                </tr>
              </thead>
              <tbody>
                {alarms.map((alarm) => (
                  <tr key={alarm.id}>
                    <td>
                      <span className={`badge ${alarm.severity}`}>{alarm.severity}</span>
                    </td>
                    <td>
                      <div className="alarm-title">{alarm.title}</div>
                      <div className="alarm-summary">{alarm.description}</div>
                    </td>
                    <td>
                      <strong>{alarm.network_element}</strong>
                      <div className="panel-sub">{alarm.location}</div>
                    </td>
                    <td>{alarm.category}</td>
                    <td>{formatTime(alarm.last_occurrence)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-btn"
                          onClick={() => void updateAlarm(alarm.id, "acknowledge")}
                          title="Acknowledge alarm"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => void updateAlarm(alarm.id, "clear")}
                          title="Clear alarm"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alarms.length === 0 && <div className="empty">No active alarms for this filter.</div>}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Ingestion Trace</h2>
              <p className="panel-sub">{snapshot.simulator.source}</p>
            </div>
            <Activity size={18} color="#667085" />
          </div>
          <div className="feed">
            <div className="feed-row">
              <p>Last snapshot pulled at {formatTime(snapshot.updated_at)}</p>
              <span>Standalone OMC-R API: /api/omcr/snapshot</span>
            </div>
            {snapshot.simulator.events.length === 0 ? (
              <div className="empty">No simulator events yet.</div>
            ) : (
              snapshot.simulator.events.slice(0, 12).map((event) => (
                <div key={event.id} className={`feed-row ${event.severity}`}>
                  <p>{event.message}</p>
                  <span>{formatTime(event.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
