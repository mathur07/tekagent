import { useState } from "react";
import {
  useHealth,
  useSkills,
  useGithubAuthStatus,
  useSetGithubToken,
  useClearGithubToken,
} from "../lib/queries";

const TABS = ["Prerequisites", "Skills"] as const;

export function SetupPage({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Prerequisites");
  const { data: health } = useHealth();
  const { data: skills = [] } = useSkills();
  const { data: authStatus } = useGithubAuthStatus();
  const setToken = useSetGithubToken();
  const clearToken = useClearGithubToken();
  const [ghToken, setGhToken] = useState("");
  const [tokenError, setTokenError] = useState("");

  const openSkillFile = async (skillName: string) => {
    await fetch(`/api/skills/${encodeURIComponent(skillName)}/open`, { method: "POST" });
  };

  const handleConnect = async () => {
    setTokenError("");
    try {
      await setToken.mutateAsync(ghToken);
      setGhToken("");
    } catch {
      setTokenError("Invalid token");
    }
  };

  const handleDisconnect = () => {
    clearToken.mutate();
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 40, overflow: "auto",
    }}>
      <div style={{ maxWidth: 600, width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", margin: 0 }}>TekAgent Setup</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>TekAgent needs GitHub CLI and Vertex AI access.</p>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>Done</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "var(--bg-tertiary)", borderRadius: 6, padding: 2 }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 600,
                background: tab === t ? "var(--bg-secondary)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                border: tab === t ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: 5, cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Prerequisites */}
        {tab === "Prerequisites" && (
          <div style={cardStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={checkRow}>
                <span style={{ ...statusDot, background: health?.gh.connected ? "var(--success)" : "var(--error)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>GitHub CLI</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {health?.gh.connected ? health.gh.detail || "Connected" : "Not connected"}
                  </div>
                  {health?.gh.connected && authStatus?.configured && (
                    <button onClick={handleDisconnect} style={{ ...editBtnStyle, marginTop: 8, color: "var(--error)" }}>
                      Disconnect
                    </button>
                  )}
                  {!health?.gh.connected && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="password"
                          value={ghToken}
                          onChange={(e) => { setGhToken(e.target.value); setTokenError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && ghToken.trim() && handleConnect()}
                          placeholder="ghp_..."
                          style={{
                            flex: 1, background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                            borderRadius: 4, padding: "6px 8px", color: "var(--text-primary)", fontSize: 12, outline: "none",
                          }}
                        />
                        <button
                          onClick={handleConnect}
                          disabled={!ghToken.trim() || setToken.isPending}
                          style={{
                            ...editBtnStyle,
                            opacity: !ghToken.trim() || setToken.isPending ? 0.5 : 1,
                          }}
                        >
                          {setToken.isPending ? "..." : "Connect"}
                        </button>
                      </div>
                      {tokenError && (
                        <div style={{ fontSize: 11, color: "var(--error)", marginTop: 4 }}>{tokenError}</div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Stored in memory only — never saved to disk.
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={checkRow}>
                <span style={{ ...statusDot, background: health?.vertex.connected ? "var(--success)" : "var(--error)" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Vertex AI</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {health?.vertex.connected ? health.vertex.detail || "Connected" : "Not connected — run: gcloud auth login"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skills */}
        {tab === "Skills" && (
          <div style={cardStyle}>
            {skills.map((skill) => (
              <div key={skill.name} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: "1px solid var(--border)",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{skill.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{skill.description}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {skill.always_enabled && <span style={tagStyle}>always active</span>}
                    {skill.user_invocable && <span style={tagStyle}>invocable</span>}
                  </div>
                </div>
                <button onClick={() => openSkillFile(skill.name)} style={editBtnStyle}>Edit</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-secondary)", border: "1px solid var(--border)",
  borderRadius: 10, padding: 24,
};
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const statusDot: React.CSSProperties = { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 };
const editBtnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4,
  color: "var(--accent)", padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
};
const tagStyle: React.CSSProperties = {
  fontSize: 10, padding: "1px 6px", borderRadius: 4,
  background: "var(--bg-tertiary)", color: "var(--text-muted)",
};
const closeBtnStyle: React.CSSProperties = {
  background: "var(--accent)", border: "none", borderRadius: 6,
  color: "#fff", padding: "8px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
