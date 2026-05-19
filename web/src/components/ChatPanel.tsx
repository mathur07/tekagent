import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWebSocket } from "../hooks/use-websocket";
import { useQueryClient } from "@tanstack/react-query";
import { useModels, useConfig } from "../lib/queries";
import { queryKeys } from "../lib/api";
import type { ChatMessage, ToolCallInfo } from "../lib/types";

function ToolCallBlock({ tc }: { tc: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ padding: "2px 0 2px 20px", fontFamily: "var(--mono)" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
      >
        <span style={{ color: "var(--text-muted)" }}>&gt;</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{tc.name}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tc.input ? JSON.stringify(tc.input).slice(0, 80) : ""}
        </span>
        {tc.output !== undefined && (
          <span style={{ color: tc.is_error ? "var(--error)" : "var(--success)", fontSize: 12 }}>
            {tc.is_error ? "✗ error" : "✓ done"}
          </span>
        )}
      </div>
      {expanded && (
        <div style={{ paddingLeft: 20, marginTop: 4 }}>
          {tc.input && (
            <pre style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", maxHeight: 150, overflow: "auto" }}>
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          )}
          {tc.output && (
            <pre style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)", maxHeight: 150, overflow: "auto" }}>
              {tc.output.slice(0, 500)}{tc.output.length > 500 ? "..." : ""}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBlock({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div style={{ padding: "8px 0" }}>
        <span style={{ color: "var(--success)", fontWeight: 700 }}>you&gt; </span>
        <span>{msg.content}</span>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ color: "var(--accent)", fontWeight: 700, marginBottom: 4 }}>agent&gt;</div>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {msg.toolCalls.map((tc) => (
            <ToolCallBlock key={tc.id} tc={tc} />
          ))}
        </div>
      )}
      {msg.content && (
        <div className="terminal-markdown" style={{ paddingLeft: 0 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      )}
      {msg.status === "streaming" && (
        <span className="cursor-blink" style={{ color: "var(--accent)" }}>_</span>
      )}
    </div>
  );
}

function parseAgentLink(name: string): { url: string; label: string } | null {
  const m = name.match(/^(PR|Issue)-(\d+)-(.+)$/);
  if (!m) return null;
  const [, type, number, repoSlug] = m;
  const repoParts = repoSlug.split("-");
  if (repoParts.length < 2) return null;
  const owner = repoParts[0];
  const repo = repoParts.slice(1).join("-");
  const path = type === "PR" ? "pull" : "issues";
  return { url: `https://github.com/${owner}/${repo}/${path}/${number}`, label: `#${number}` };
}

interface ChatPanelProps {
  agentName: string | null;
  initialPrompt?: string | null;
  onPromptConsumed?: () => void;
  onClose?: () => void;
  onDelete?: (name: string) => void;
}

export function ChatPanel({ agentName, initialPrompt, onPromptConsumed, onClose, onDelete }: ChatPanelProps) {
  const qc = useQueryClient();
  const { messages, isConnected, isGenerating, historyLoaded, sendMessage, stopQuery, clearContext } =
    useWebSocket(agentName, () => qc.invalidateQueries({ queryKey: queryKeys.agents }));
  const [input, setInput] = useState("");
  const { data: models = [] } = useModels();
  const { data: configData } = useConfig();
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (configData && !selectedModel) setSelectedModel(configData.model);
  }, [configData]);

  useEffect(() => {
    if (initialPrompt && isConnected && !isGenerating && initialPrompt !== promptSentRef.current) {
      promptSentRef.current = initialPrompt;
      sendMessage(initialPrompt, selectedModel || undefined);
      onPromptConsumed?.();
    }
  }, [initialPrompt, isConnected, isGenerating]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isGenerating) inputRef.current?.focus();
  }, [isGenerating, messages]);

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    sendMessage(input.trim(), selectedModel || undefined);
    setInput("");
  };

  if (!agentName) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontFamily: "var(--mono)" }}>
        Select an agent or click Interact on a PR/issue
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", fontFamily: "var(--mono)", fontSize: 14 }}>
      {/* Header bar */}
      <div style={{
        padding: "8px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 13,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>{agentName}</span>
          {agentName && (() => {
            const link = parseAgentLink(agentName);
            return link ? (
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 12, textDecoration: "none" }} title="Open on GitHub">{link.label} ↗</a>
            ) : null;
          })()}
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: isConnected ? "var(--success)" : "var(--error)",
          }} />
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4,
              color: "var(--text-primary)", padding: "2px 6px", fontSize: 11, outline: "none", cursor: "pointer",
              fontFamily: "var(--mono)",
            }}
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isGenerating && (
            <button onClick={stopQuery} style={{ ...headerBtn, color: "#ef4444", borderColor: "#ef4444" }}>
              stop
            </button>
          )}
          <button onClick={clearContext} style={{ ...headerBtn, color: "#f59e0b", borderColor: "#f59e0b" }}>clear</button>
          {onClose && <button onClick={onClose} style={{ ...headerBtn, color: "#3b82f6", borderColor: "#3b82f6" }}>close</button>}
          {onDelete && agentName && (
            confirmDelete ? (
              <button onClick={() => { setConfirmDelete(false); if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); onDelete(agentName); }} style={{ ...headerBtn, color: "#fff", background: "#ef4444", borderColor: "#ef4444" }}>confirm?</button>
            ) : (
              <button onClick={() => { setConfirmDelete(true); confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000); }} style={{ ...headerBtn, color: "#f87171", borderColor: "#f87171" }}>delete</button>
            )
          )}
        </div>
      </div>

      {/* Terminal output */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        {messages.length === 0 && !isGenerating && !historyLoaded && (
          <div style={{ color: "var(--text-muted)", padding: "40px 0" }}>
            <div>Loading history...</div>
          </div>
        )}
        {messages.length === 0 && !isGenerating && historyLoaded && (
          <div style={{ color: "var(--text-muted)", padding: "40px 0" }}>
            <div>TekAgent — {agentName}</div>
            <div style={{ marginTop: 4 }}>Type a message to begin.</div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBlock key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input line */}
      <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <span style={{ color: "var(--success)", fontWeight: 700, flexShrink: 0 }}>you&gt;&nbsp;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isGenerating}
            placeholder={isGenerating ? "agent is thinking..." : ""}
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: 14,
              fontFamily: "var(--mono)",
              outline: "none",
              caretColor: "var(--accent)",
            }}
          />
        </div>
      </div>

      <style>{`
        :root { --mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, monospace; }

        .cursor-blink { animation: blink 1s step-end infinite; }
        @keyframes blink { 50% { opacity: 0; } }

        .terminal-markdown { line-height: 1.6; }
        .terminal-markdown p { margin: 4px 0; }
        .terminal-markdown h1, .terminal-markdown h2, .terminal-markdown h3 {
          margin: 12px 0 6px;
          color: var(--accent);
          font-size: inherit;
          font-weight: 700;
        }
        .terminal-markdown h1::before { content: "# "; color: var(--text-muted); }
        .terminal-markdown h2::before { content: "## "; color: var(--text-muted); }
        .terminal-markdown h3::before { content: "### "; color: var(--text-muted); }
        .terminal-markdown ul, .terminal-markdown ol { padding-left: 16px; margin: 4px 0; }
        .terminal-markdown li { margin: 2px 0; }
        .terminal-markdown strong { color: var(--text-primary); font-weight: 700; }
        .terminal-markdown code {
          background: var(--bg-tertiary);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 13px;
        }
        .terminal-markdown pre {
          background: var(--bg-tertiary) !important;
          padding: 10px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 6px 0;
          border: 1px solid var(--border);
        }
        .terminal-markdown pre code { background: transparent; padding: 0; }
        .terminal-markdown table { border-collapse: collapse; margin: 6px 0; }
        .terminal-markdown th, .terminal-markdown td {
          border: 1px solid var(--border);
          padding: 4px 10px;
          text-align: left;
          font-size: 13px;
        }
        .terminal-markdown th { color: var(--accent); }
        .terminal-markdown blockquote {
          border-left: 2px solid var(--accent);
          margin: 6px 0;
          padding-left: 12px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-secondary)",
  padding: "2px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "var(--mono)",
};
