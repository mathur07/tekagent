import { useState } from "react";
import type { Agent } from "../lib/types";
import { useRunningAgents } from "../lib/queries";

interface Props {
  agents: Agent[];
  selectedAgent: string | null;
  onSelectAgent: (name: string) => void;
  onCreateAgent: (name: string) => void;
  onDeleteAgent: (name: string) => void;
  onDashboard: () => void;
  showDashboard: boolean;
}

interface ParsedAgent {
  name: string;
  type: "PR" | "Issue";
  number: number;
  repo: string;
}

function parseAgentName(name: string): ParsedAgent | null {
  const match = name.match(/^(PR|Issue)-(\d+)-(.+)$/);
  if (!match) return null;
  return {
    name,
    type: match[1] as "PR" | "Issue",
    number: parseInt(match[2], 10),
    repo: match[3],
  };
}

function formatRepo(repo: string): string {
  const idx = repo.indexOf("-");
  if (idx === -1) return repo;
  return repo.slice(0, idx) + "/" + repo.slice(idx + 1);
}

function AgentRow({
  label,
  isSelected,
  isRunning,
  onSelect,
  onDelete,
  indent,
}: {
  label: string;
  isSelected: boolean;
  isRunning: boolean;
  onSelect: () => void;
  onDelete: () => void;
  indent: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: indent ? "5px 8px 5px 28px" : "8px 12px",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: isSelected ? "var(--bg-tertiary)" : "transparent",
        marginBottom: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            background: isRunning ? "var(--warning)" : "var(--success)",
            animation: isRunning ? "pulse 1s infinite" : "none",
          }}
        />
        <span style={{
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        {isRunning && (
          <span style={{ fontSize: 10, color: "var(--warning)", flexShrink: 0 }}>working...</span>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 13,
          padding: "0 4px",
          flexShrink: 0,
        }}
        title="Delete agent"
      >
        x
      </button>
    </div>
  );
}

export function Sidebar({
  agents,
  selectedAgent,
  onSelectAgent,
  onCreateAgent,
  onDeleteAgent,
  onDashboard,
  showDashboard,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const { data: runningList = [] } = useRunningAgents();
  const runningAgents = new Set(runningList);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());

  const handleCreate = () => {
    if (newName.trim()) {
      onCreateAgent(newName.trim());
      setNewName("");
      setShowCreate(false);
    }
  };

  const toggleRepo = (repo: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  };

  const repoGroups: Record<string, ParsedAgent[]> = {};
  const standalone: Agent[] = [];

  for (const agent of agents) {
    const parsed = parseAgentName(agent.name);
    if (parsed) {
      if (!repoGroups[parsed.repo]) repoGroups[parsed.repo] = [];
      repoGroups[parsed.repo].push(parsed);
    } else {
      standalone.push(agent);
    }
  }

  for (const items of Object.values(repoGroups)) {
    items.sort((a, b) => b.number - a.number);
  }

  const repoKeys = Object.keys(repoGroups).sort();

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
      }}
    >
      <div style={{ padding: "0 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            margin: 0,
            color: "var(--accent)",
            letterSpacing: "-0.5px",
          }}
        >
          TekAgent
        </h1>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Agent Platform
        </span>
      </div>

      {/* Dashboard + Setup links */}
      <div style={{ padding: "8px" }}>
        <div
          onClick={onDashboard}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: showDashboard ? "var(--bg-tertiary)" : "transparent",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 14 }}>Dashboard</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
        {/* Repo-grouped agents */}
        {repoKeys.map((repo) => {
          const items = repoGroups[repo];
          const collapsed = collapsedRepos.has(repo);
          const hasRunning = items.some((a) => runningAgents.has(a.name));
          const hasSelected = !showDashboard && items.some((a) => a.name === selectedAgent);

          return (
            <div key={repo} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleRepo(repo)}
                style={{
                  padding: "6px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 4,
                  userSelect: "none",
                }}
              >
                <span style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  transition: "transform 0.15s",
                  transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  display: "inline-block",
                }}>
                  ▼
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: hasSelected ? "var(--accent)" : "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}>
                  {formatRepo(repo)}
                </span>
                {hasRunning && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "var(--warning)",
                    animation: "pulse 1s infinite",
                    flexShrink: 0,
                  }} />
                )}
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{items.length}</span>
              </div>
              {!collapsed && items.map((parsed) => (
                <AgentRow
                  key={parsed.name}
                  label={`${parsed.type} #${parsed.number}`}
                  isSelected={!showDashboard && selectedAgent === parsed.name}
                  isRunning={runningAgents.has(parsed.name)}
                  onSelect={() => onSelectAgent(parsed.name)}
                  onDelete={() => onDeleteAgent(parsed.name)}
                  indent
                />
              ))}
            </div>
          );
        })}

        {/* Standalone agents */}
        {standalone.length > 0 && repoKeys.length > 0 && (
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "1px",
            padding: "8px 8px 4px",
          }}>
            Agents
          </div>
        )}
        {standalone.map((agent) => (
          <AgentRow
            key={agent.name}
            label={agent.name}
            isSelected={!showDashboard && selectedAgent === agent.name}
            isRunning={runningAgents.has(agent.name)}
            onSelect={() => onSelectAgent(agent.name)}
            onDelete={() => onDeleteAgent(agent.name)}
            indent={false}
          />
        ))}
      </div>

      <div style={{ padding: "8px" }}>
        {showCreate ? (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Agent name"
              autoFocus
              style={{
                flex: 1,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "6px 8px",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={handleCreate}
              style={{
                background: "var(--accent)",
                border: "none",
                borderRadius: 4,
                color: "#fff",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              width: "100%",
              background: "none",
              border: "1px dashed var(--border)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              padding: "8px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            + Add Agent
          </button>
        )}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
