import { useState } from "react";
import type { Skill } from "../lib/types";
import {
  useConfig,
  useRepos,
  useModels,
  useHealth,
  useSettings,
  useActivity,
  useEvents,
  useUpdateConfig,
  useUpdateRepos,
  useUpdateSettings,
} from "../lib/queries";

interface Props {
  skills: Skill[];
  onSetup?: () => void;
}

const TERMINALS = [
  { value: "ghostty", label: "Ghostty" },
  { value: "terminal", label: "Terminal.app" },
  { value: "iterm", label: "iTerm2" },
  { value: "wezterm", label: "WezTerm" },
  { value: "alacritty", label: "Alacritty" },
];

export function RightPanel({ skills, onSetup }: Props) {
  const { data: config } = useConfig();
  const { data: repos = [] } = useRepos();
  const { data: models = [] } = useModels();
  const { data: health } = useHealth();
  const { data: settings } = useSettings();
  const { data: activity = [] } = useActivity(24);
  const { data: events = [] } = useEvents(20);
  const updateConfig = useUpdateConfig();
  const updateRepos = useUpdateRepos();
  const updateSettings = useUpdateSettings();

  const [newRepo, setNewRepo] = useState("");
  const [eventsExpanded, setEventsExpanded] = useState(false);

  const terminal = settings?.terminal || "ghostty";
  const terminalModel = settings?.terminal_model || "claude-sonnet-4-5";

  const parseRepo = (input: string): string => {
    const trimmed = input.trim().replace(/\/+$/, "");
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes("github")) {
        const parts = url.pathname.replace(/^\//, "").split("/");
        if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
      }
    } catch {}
    return trimmed;
  };

  const addRepo = async () => {
    const repo = parseRepo(newRepo);
    if (!repo || repos.includes(repo)) return;
    await updateRepos.mutateAsync([...repos, repo]);
    setNewRepo("");
  };

  const removeRepo = async (repo: string) => {
    await updateRepos.mutateAsync(repos.filter((r) => r !== repo));
  };

  const sectionHeader = {
    fontSize: 11,
    fontWeight: 600 as const,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    margin: "0 0 12px",
  };

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border)",
        padding: "16px",
        overflow: "auto",
      }}
    >
      {/* Watched Repos */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>Watched Repos</h3>

        {repos.map((repo) => (
          <div
            key={repo}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 0",
              fontSize: 13,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                }}
              />
              {repo}
            </span>
            <button
              onClick={() => removeRepo(repo)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 13,
                padding: "0 4px",
              }}
            >
              x
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <input
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRepo()}
            placeholder="owner/repo"
            style={{
              flex: 1,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "5px 8px",
              color: "var(--text-primary)",
              fontSize: 12,
              outline: "none",
            }}
          />
          <button
            onClick={addRepo}
            style={{
              background: "var(--accent)",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Skills */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={sectionHeader}>Skills</h3>
        {skills.map((skill) => (
          <div
            key={skill.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 0",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: skill.always_enabled
                    ? "var(--success)"
                    : "var(--text-muted)",
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{skill.name}</span>
            </div>
            <button
              onClick={() => fetch(`/api/skills/${encodeURIComponent(skill.name)}/open`, { method: "POST" })}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-muted)",
                padding: "1px 6px",
                cursor: "pointer",
                fontSize: 10,
                flexShrink: 0,
              }}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {/* Activity Log */}
      {activity.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={sectionHeader}>Recent Activity</h3>
          {activity.slice(0, 6).map((a: any) => {
            const icon = a.action.includes("terminal") ? ">_" : a.action.includes("review") ? "PR" : a.action.includes("chat") ? "::" : "..";
            const time = a.created_at ? new Date(a.created_at + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12 }}>
                <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 10, width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
                <span style={{ flex: 1, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.item_type ? `#${a.item_number}` : a.action}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>{time}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Log */}
      {events.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3
            style={{ ...sectionHeader, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setEventsExpanded(!eventsExpanded)}
          >
            <span style={{ fontSize: 10, transform: eventsExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", display: "inline-block" }}>
              ▼
            </span>
            Event Log
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({events.length})</span>
          </h3>
          {eventsExpanded && events.map((ev: any) => {
            const colors: Record<string, string> = {
              command_blocked: "var(--error)",
              tool_call: "var(--accent)",
              agent_created: "var(--success)",
              agent_deleted: "var(--text-muted)",
            };
            const color = colors[ev.event_type] || "var(--text-secondary)";
            const time = ev.created_at ? new Date(ev.created_at + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            return (
              <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.event_type.replace(/_/g, " ")}
                  {ev.agent_name && <span style={{ color: "var(--text-muted)" }}> — {ev.agent_name}</span>}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>{time}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* API Status */}
      {health && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={sectionHeader}>Status</h3>
          {[
            { label: "Vertex AI", ok: health.vertex.connected, detail: health.vertex.detail },
            { label: "GitHub CLI", ok: health.gh.connected, detail: health.gh.detail },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.ok ? "var(--success)" : "var(--error)", flexShrink: 0 }} />
              <span>{s.label}</span>
              {s.detail && <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Config */}
      {config && (
        <div>
          <h3 style={sectionHeader}>Configuration</h3>
          <div style={{ fontSize: 13 }}>
            <div style={configRow}>
              <span style={{ color: "var(--text-secondary)" }}>Terminal Model</span>
              <select
                value={terminalModel}
                onChange={(e) => updateSettings.mutate({ terminal_model: e.target.value })}
                style={selectStyle}
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div style={configRow}>
              <span style={{ color: "var(--text-secondary)" }}>Terminal</span>
              <span>{TERMINALS.find((t) => t.value === terminal)?.label || terminal}</span>
            </div>
            <div style={configRow}>
              <span style={{ color: "var(--text-secondary)" }}>Chat Model</span>
              <select
                value={config.model}
                onChange={(e) => updateConfig.mutate({ model: e.target.value })}
                style={selectStyle}
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div style={configRow}>
              <span style={{ color: "var(--text-secondary)" }}>Region</span>
              <span>{config.google_cloud_region}</span>
            </div>
          </div>
        </div>
      )}

      {/* Setup */}
      {onSetup && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={onSetup}
            style={{
              width: "100%",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              padding: "8px",
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Setup</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>⌘,</span>
          </button>
        </div>
      )}
    </div>
  );
}

const configRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: "1px solid var(--border)",
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  padding: "2px 6px",
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};
