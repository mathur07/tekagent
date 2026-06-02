import { useState } from "react";
import { useModels, useDashboard, useBookmarks, useToggleBookmark, useProductivity } from "../lib/queries";
import * as api from "../lib/api";
import { ProductivityDashboard } from "./ProductivityDashboard";

interface PR {
  number: number;
  title: string;
  author: { login: string; is_bot: boolean };
  labels: { name: string }[];
  url: string;
  createdAt: string;
  reviewDecision?: string;
  isDraft?: boolean;
  repo?: string;
  comments?: { author: { login: string; is_bot: boolean } }[];
  reviews?: { author: { login: string; is_bot: boolean }; state: string }[];
}

interface Issue {
  number: number;
  title: string;
  labels: { name: string }[];
  url: string;
  createdAt: string;
  assignees: { login: string }[];
  repo?: string;
}

interface MergedPR {
  number: number;
  title: string;
  author: { login: string; is_bot: boolean };
  mergedAt: string;
  url: string;
}

interface RepoData {
  repo: string;
  open_prs: PR[];
  issues: Issue[];
  recent_merges: MergedPR[];
  error?: string;
}

interface ItemAnalysis {
  size: string;
  priority: string;
  reason: string;
}

interface RepoAnalysis {
  prs: Record<string, ItemAnalysis>;
  issues: Record<string, ItemAnalysis>;
}

const PRS_PER_PAGE = 10;
const ISSUES_PER_PAGE = 7;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const sizeColors: Record<string, string> = {
  S: "#9ece6a", M: "#e0af68", L: "#f7768e", XL: "#bb9af7",
};
const priorityColors: Record<string, string> = {
  critical: "#f7768e", high: "#ff9e64", medium: "#e0af68", low: "#565f89",
};

function SizeBadge({ size }: { size: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: sizeColors[size] || "var(--text-muted)", color: "#1a1b26" }}>
      {size}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, border: `1px solid ${priorityColors[priority] || "var(--border)"}`, color: priorityColors[priority] || "var(--text-secondary)" }}>
      {priority}
    </span>
  );
}

function LabelBadge({ name }: { name: string }) {
  const colors: Record<string, string> = { "good first issue": "var(--success)", "help wanted": "var(--warning)", "kind/bug": "var(--error)", "kind/feature": "var(--accent)" };
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, border: `1px solid ${colors[name] || "var(--border)"}`, color: colors[name] || "var(--text-secondary)" }}>
      {name}
    </span>
  );
}

function CIBadge({ checks }: { checks: any[] | undefined }) {
  if (!checks || checks.length === 0) return null;
  const failed = checks.some((c: any) => c.conclusion === "FAILURE");
  const pending = checks.some((c: any) => !c.conclusion || c.conclusion === "PENDING");
  const color = failed ? "var(--error)" : pending ? "var(--warning)" : "var(--success)";
  const title = failed ? "CI failing" : pending ? "CI pending" : "CI passing";
  return <span title={title} style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function AuthorAvatar({ login, is_bot }: { login: string; is_bot?: boolean }) {
  if (is_bot) {
    return (
      <span
        title={login}
        style={{
          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
          background: "var(--bg-tertiary)", border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 11,
        }}
      >
        🤖
      </span>
    );
  }
  return (
    <img
      src={`https://github.com/${login}.png?size=32`}
      alt={login}
      title={`@${login}`}
      style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: "1px solid var(--border)" }}
    />
  );
}

function CommentersAvatars({ pr }: { pr: PR }) {
  const seen = new Set<string>();
  const people: { login: string; is_bot: boolean }[] = [];

  for (const r of pr.reviews ?? []) {
    if (!r.author.is_bot && r.author.login !== pr.author.login && !seen.has(r.author.login)) {
      seen.add(r.author.login);
      people.push(r.author);
    }
  }
  for (const c of pr.comments ?? []) {
    if (!c.author.is_bot && c.author.login !== pr.author.login && !seen.has(c.author.login)) {
      seen.add(c.author.login);
      people.push(c.author);
    }
  }

  if (people.length === 0) return null;

  const visible = people.slice(0, 8);
  const extra = people.length - visible.length;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {visible.map((p, i) => (
        <img
          key={p.login}
          src={`https://github.com/${p.login}.png?size=32`}
          alt={p.login}
          title={`@${p.login}`}
          style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "1.5px solid var(--bg-secondary)",
            marginLeft: i === 0 ? 0 : -6,
            zIndex: visible.length - i,
            position: "relative",
          }}
        />
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>+{extra}</span>
      )}
    </div>
  );
}


function Pagination({ total, perPage, page, onPageChange }: { total: number; perPage: number; page: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px" }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{ ...pgBtnStyle, opacity: page === 0 ? 0.3 : 1, cursor: page === 0 ? "default" : "pointer" }}
      >
        Prev
      </button>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ ...pgBtnStyle, opacity: page >= totalPages - 1 ? 0.3 : 1, cursor: page >= totalPages - 1 ? "default" : "pointer" }}
      >
        Next
      </button>
    </div>
  );
}

const pgBtnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "3px 10px", fontSize: 12,
};

type SortMode = "priority" | "size" | "newest";

const SORT_OPTIONS: { value: SortMode; label: string; tooltip: string }[] = [
  { value: "priority", label: "Priority", tooltip: "Critical first, then high, medium, low" },
  { value: "size", label: "Size", tooltip: "Largest first (XL → L → M → S)" },
  { value: "newest", label: "Newest", tooltip: "Most recently created first" },
];


function sortItems<T extends { number: number; createdAt: string }>(
  items: T[],
  mode: SortMode,
  analysis: Record<string, ItemAnalysis> | undefined,
): T[] {
  if (mode === "newest" || !analysis) {
    return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sizeOrder = { XL: 0, L: 1, M: 2, S: 3 };

  return [...items].sort((a, b) => {
    const aa = analysis[String(a.number)];
    const ba = analysis[String(b.number)];

    if (mode === "priority") {
      const pa = priorityOrder[(aa?.priority || "medium") as keyof typeof priorityOrder] ?? 2;
      const pb = priorityOrder[(ba?.priority || "medium") as keyof typeof priorityOrder] ?? 2;
      if (pa !== pb) return pa - pb;
      const sa = sizeOrder[(aa?.size || "M") as keyof typeof sizeOrder] ?? 2;
      const sb = sizeOrder[(ba?.size || "M") as keyof typeof sizeOrder] ?? 2;
      return sa - sb;
    }

    const sa = sizeOrder[(aa?.size || "M") as keyof typeof sizeOrder] ?? 2;
    const sb = sizeOrder[(ba?.size || "M") as keyof typeof sizeOrder] ?? 2;
    if (sa !== sb) return sa - sb;
    const pa = priorityOrder[(aa?.priority || "medium") as keyof typeof priorityOrder] ?? 2;
    const pb = priorityOrder[(ba?.priority || "medium") as keyof typeof priorityOrder] ?? 2;
    return pa - pb;
  });
}

function SortSelector({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: "0 16px 6px" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 6, alignSelf: "center" }}>Sort:</span>
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.tooltip}
          style={{
            background: value === opt.value ? "var(--bg-tertiary)" : "transparent",
            border: value === opt.value ? "1px solid var(--border)" : "1px solid transparent",
            borderRadius: 4,
            color: value === opt.value ? "var(--text-primary)" : "var(--text-muted)",
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: value === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export interface InteractRequest {
  type: "pr" | "issue";
  number: number;
  repo: string;
  title: string;

}

function RepoCard({ data, analysis, onInteract, bookmarks, onToggleBookmark }: { data: RepoData; analysis?: RepoAnalysis; onInteract: (req: InteractRequest) => void; bookmarks: Set<string>; onToggleBookmark: (repo: string, type: string, num: number, title: string, url: string) => void }) {
  const [prPage, setPrPage] = useState(0);
  const [issuePage, setIssuePage] = useState(0);
  const [prSort, setPrSort] = useState<SortMode>("newest");
  const [issueSort, setIssueSort] = useState<SortMode>("newest");
  const [visited, setVisited] = useState<Set<string>>(new Set);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleVisit = (url: string) => {
    setVisited((prev) => new Set(prev).add(url));
  };

  const copyCliCommand = (type: "pr" | "issue", number: number, repo: string) => {
    const action = type === "pr"
      ? `Review PR #${number} in ${repo}. Fetch the diff and provide a structured review with summary, issues, and verdict.`
      : `Analyze issue #${number} in ${repo}. Fetch the details, assess complexity, suggest an approach, and identify files to change.`;
    navigator.clipboard.writeText(`claude -p "${action}"`);
    const key = `${type}:${number}`;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (data.error) {
    return (
      <div style={cardStyle}>
        <div style={cardHeader}>{data.repo}</div>
        <div style={{ color: "var(--error)", fontSize: 13, padding: 12 }}>{data.error}</div>
      </div>
    );
  }

  const sortedPRs = sortItems(data.open_prs, prSort, analysis?.prs);
  const sortedIssues = sortItems(data.issues, issueSort, analysis?.issues);
  const pagedPRs = sortedPRs.slice(prPage * PRS_PER_PAGE, (prPage + 1) * PRS_PER_PAGE);
  const pagedIssues = sortedIssues.slice(issuePage * ISSUES_PER_PAGE, (issuePage + 1) * ISSUES_PER_PAGE);

  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <a href={`https://github.com/${data.repo}`} target="_blank" rel="noopener" style={{ color: "var(--accent)", textDecoration: "none" }}>
          {data.repo}
        </a>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
          <span>{data.open_prs.length} PRs</span>
          <span>{data.issues.length} issues</span>
        </div>
      </div>

      {sortedPRs.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}>Open Pull Requests</div>
            <SortSelector value={prSort} onChange={(v) => { setPrSort(v); setPrPage(0); }} />
          </div>
          {pagedPRs.map((pr) => {
            const a = analysis?.prs?.[String(pr.number)];
            return (
              <div key={pr.number} style={{ ...itemStyle, opacity: visited.has(pr.url) ? 0.55 : 1 }} title={a?.reason}>
                <a href={pr.url} target="_blank" rel="noopener" onClick={() => handleVisit(pr.url)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, textDecoration: "none" }}>
                  <AuthorAvatar login={pr.author.login} is_bot={pr.author.is_bot} />
                  {a && <SizeBadge size={a.size} />}
                  {a && <PriorityBadge priority={a.priority} />}
                  <span style={{ color: visited.has(pr.url) ? "var(--text-muted)" : "var(--success)", fontSize: 12, flexShrink: 0 }}>#{pr.number}</span>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {pr.isDraft ? "[Draft] " : ""}{pr.title}
                  </span>
                </a>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <CommentersAvatars pr={pr} />
                  <CIBadge checks={(pr as any).statusCheckRollup} />
                  {pr.labels.slice(0, 1).map((l) => <LabelBadge key={l.name} name={l.name} />)}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 40 }}>{timeAgo(pr.createdAt)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleBookmark(data.repo, "pr", pr.number, pr.title, pr.url); }}
                    style={{ ...starBtnStyle, color: bookmarks.has(`${data.repo}:pr:${pr.number}`) ? "var(--warning)" : "var(--text-muted)" }}
                    title={bookmarks.has(`${data.repo}:pr:${pr.number}`) ? "Remove bookmark" : "Bookmark"}
                  >
                    {bookmarks.has(`${data.repo}:pr:${pr.number}`) ? "★" : "☆"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyCliCommand("pr", pr.number, data.repo); }}
                    style={{ ...interactBtnStyle, color: copiedKey === `pr:${pr.number}` ? "var(--success)" : "var(--text-secondary)" }}
                    title="Copy CLI command"
                  >
                    {copiedKey === `pr:${pr.number}` ? "copied!" : ">_"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onInteract({ type: "pr", number: pr.number, repo: data.repo, title: pr.title }); }}
                    style={interactBtnStyle}
                    title="Chat with agent"
                  >
                    &#x1F4AC;
                  </button>
                </div>
              </div>
            );
          })}
          <Pagination total={sortedPRs.length} perPage={PRS_PER_PAGE} page={prPage} onPageChange={setPrPage} />
        </div>
      )}

      {sortedIssues.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={sectionTitle}>Open Issues</div>
            <SortSelector value={issueSort} onChange={(v) => { setIssueSort(v); setIssuePage(0); }} />
          </div>
          {pagedIssues.map((issue) => {
            const a = analysis?.issues?.[String(issue.number)];
            return (
              <div key={issue.number} style={{ ...itemStyle, opacity: visited.has(issue.url) ? 0.55 : 1 }} title={a?.reason}>
                <a href={issue.url} target="_blank" rel="noopener" onClick={() => handleVisit(issue.url)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, textDecoration: "none" }}>
                  {a && <SizeBadge size={a.size} />}
                  {a && <PriorityBadge priority={a.priority} />}
                  <span style={{ color: visited.has(issue.url) ? "var(--text-muted)" : "var(--accent)", fontSize: 12, flexShrink: 0 }}>#{issue.number}</span>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {issue.title}
                  </span>
                </a>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {issue.labels.slice(0, 1).map((l) => <LabelBadge key={l.name} name={l.name} />)}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 40 }}>{timeAgo(issue.createdAt)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleBookmark(data.repo, "issue", issue.number, issue.title, issue.url); }}
                    style={{ ...starBtnStyle, color: bookmarks.has(`${data.repo}:issue:${issue.number}`) ? "var(--warning)" : "var(--text-muted)" }}
                    title={bookmarks.has(`${data.repo}:issue:${issue.number}`) ? "Remove bookmark" : "Bookmark"}
                  >
                    {bookmarks.has(`${data.repo}:issue:${issue.number}`) ? "★" : "☆"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyCliCommand("issue", issue.number, data.repo); }}
                    style={{ ...interactBtnStyle, color: copiedKey === `issue:${issue.number}` ? "var(--success)" : "var(--text-secondary)" }}
                    title="Copy CLI command"
                  >
                    {copiedKey === `issue:${issue.number}` ? "copied!" : ">_"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onInteract({ type: "issue", number: issue.number, repo: data.repo, title: issue.title }); }}
                    style={interactBtnStyle}
                    title="Chat with agent"
                  >
                    &#x1F4AC;
                  </button>
                </div>
              </div>
            );
          })}
          <Pagination total={sortedIssues.length} perPage={ISSUES_PER_PAGE} page={issuePage} onPageChange={setIssuePage} />
        </div>
      )}

      {data.recent_merges.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Recently Merged</div>
          {data.recent_merges.map((pr) => (
            <a key={pr.number} href={pr.url} target="_blank" rel="noopener" style={itemStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <AuthorAvatar login={pr.author.login} is_bot={pr.author.is_bot} />
                <span style={{ color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>#{pr.number}</span>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{pr.title}</span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{timeAgo(pr.mergedAt)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Search Results ---- */

function SearchResults({ results, onAnalyze, analyzing, analysis }: {
  results: { prs: PR[]; issues: Issue[] };
  onAnalyze: () => void;
  analyzing: boolean;
  analysis: RepoAnalysis | null;
}) {
  const hasPRs = results.prs.length > 0;
  const hasIssues = results.issues.length > 0;

  if (!hasPRs && !hasIssues) {
    return <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 24, fontSize: 14 }}>No results found</div>;
  }

  return (
    <div style={cardStyle}>
      <div style={cardHeader}>
        <span>Search Results</span>
        <button
          onClick={() => onAnalyze()}
          disabled={analyzing}
          style={{
            background: analyzing ? "var(--bg-tertiary)" : "var(--warning)",
            border: "none", borderRadius: 6,
            color: analyzing ? "var(--text-muted)" : "#1a1b26",
            padding: "4px 12px", cursor: analyzing ? "default" : "pointer",
            fontSize: 12, fontWeight: 600,
          }}
        >
          {analyzing ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {hasPRs && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Pull Requests ({results.prs.length})</div>
          {results.prs.map((pr) => {
            const a = analysis?.prs?.[String(pr.number)];
            return (
              <a key={`${pr.repo}-${pr.number}`} href={pr.url} target="_blank" rel="noopener" style={itemStyle} title={a?.reason}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                  {a && <SizeBadge size={a.size} />}
                  {a && <PriorityBadge priority={a.priority} />}
                  <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{pr.repo}</span>
                  <span style={{ color: "var(--success)", fontSize: 12, flexShrink: 0 }}>#{pr.number}</span>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(pr.createdAt)}</span>
              </a>
            );
          })}
        </div>
      )}

      {hasIssues && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Issues ({results.issues.length})</div>
          {results.issues.map((issue) => {
            const a = analysis?.issues?.[String(issue.number)];
            return (
              <a key={`${issue.repo}-${issue.number}`} href={issue.url} target="_blank" rel="noopener" style={itemStyle} title={a?.reason}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                  {a && <SizeBadge size={a.size} />}
                  {a && <PriorityBadge priority={a.priority} />}
                  <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{issue.repo}</span>
                  <span style={{ color: "var(--accent)", fontSize: 12, flexShrink: 0 }}>#{issue.number}</span>
                  <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.title}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(issue.createdAt)}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: 16, overflow: "hidden" };
const cardHeader: React.CSSProperties = { padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15, fontWeight: 600 };
const sectionStyle: React.CSSProperties = { padding: "8px 0" };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "4px 16px 6px" };
const itemStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px", gap: 12, textDecoration: "none", cursor: "pointer", borderBottom: "1px solid var(--border)" };
const interactBtnStyle: React.CSSProperties = { background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--accent)", padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" };
const starBtnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 };


/* ---- Main Dashboard ---- */

export function Dashboard({ onInteract }: { onInteract: (req: InteractRequest) => void }) {
  const [activeTab, setActiveTab] = useState<"repos" | "activity">("repos");
  const { data: models = [] } = useModels();
  const { data: dashboardData = [], isLoading: loading, isFetching, refetch: refetchDashboard, dataUpdatedAt } = useDashboard();
  const { isFetching: activityFetching, forceRefresh: refetchActivity } = useProductivity();
  const { data: bookmarkItems = [] } = useBookmarks();
  const toggleBookmarkMut = useToggleBookmark();
  const data = dashboardData as RepoData[];
  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [analysis, setAnalysis] = useState<Record<string, RepoAnalysis>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("claude-haiku-4-5");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ prs: PR[]; issues: Issue[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchAnalysis, setSearchAnalysis] = useState<RepoAnalysis | null>(null);
  const [analyzingSearch, setAnalyzingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bookmarkKey = (repo: string, type: string, num: number) => `${repo}:${type}:${num}`;
  const bookmarks = new Set(bookmarkItems.map((b: any) => bookmarkKey(b.repo, b.item_type, b.item_number)));

  const toggleBookmark = (repo: string, type: string, number: number, title: string, url: string) => {
    const key = bookmarkKey(repo, type, number);
    toggleBookmarkMut.mutate({ repo, itemType: type, itemNumber: number, title, url, isBookmarked: bookmarks.has(key) });
  };

  const fetchData = () => refetchDashboard();

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const results = await api.analyzeDashboard(selectedModel);
      const map: Record<string, RepoAnalysis> = {};
      for (const r of results) map[r.repo] = r.analysis;
      setAnalysis(map);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchAnalysis(null);
    try {
      setSearchResults(await api.searchDashboard(searchQuery.trim()));
    } finally {
      setSearching(false);
    }
  };

  const analyzeSearchResults = async () => {
    setAnalyzingSearch(true);
    try {
      const results = await api.analyzeDashboard(selectedModel);
      const merged: RepoAnalysis = { prs: {}, issues: {} };
      for (const r of results) {
        Object.assign(merged.prs, r.analysis.prs || {});
        Object.assign(merged.issues, r.analysis.issues || {});
      }
      setSearchAnalysis(merged);
    } finally {
      setAnalyzingSearch(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchAnalysis(null);
  };

  const hasAnalysis = Object.keys(analysis).length > 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Tab toggle */}
          <div style={{ display: "flex", background: "var(--bg-tertiary)", borderRadius: 6, padding: 2 }}>
            {(["repos", "activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "var(--bg-secondary)" : "transparent",
                  border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
                  borderRadius: 5, padding: "4px 12px", fontSize: 12, fontWeight: 500,
                  color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {tab === "repos" ? "Repos" : "My Activity"}
              </button>
            ))}
          </div>
          {activeTab === "repos" && lastRefresh && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
        </div>
        {activeTab === "activity" && (
          <button onClick={() => refetchActivity()} disabled={activityFetching}
            style={{
              background: activityFetching ? "var(--bg-tertiary)" : "var(--accent)", border: "none", borderRadius: 6,
              color: activityFetching ? "var(--text-muted)" : "#fff", padding: "6px 16px", cursor: activityFetching ? "default" : "pointer", fontSize: 13, fontWeight: 600,
            }}
          >
            {activityFetching ? "Loading..." : "Refresh"}
          </button>
        )}
        {activeTab === "repos" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 6,
                color: "var(--text-primary)", padding: "6px 8px", fontSize: 12, outline: "none", cursor: "pointer",
              }}
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button onClick={runAnalysis} disabled={analyzing || data.length === 0}
              style={{
                background: analyzing ? "var(--bg-tertiary)" : hasAnalysis ? "var(--bg-tertiary)" : "var(--warning)",
                border: hasAnalysis ? "1px solid var(--border)" : "none",
                borderRadius: 6, color: analyzing ? "var(--text-muted)" : hasAnalysis ? "var(--text-primary)" : "#1a1b26",
                padding: "6px 16px", cursor: analyzing || data.length === 0 ? "default" : "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              {analyzing ? "Analyzing..." : hasAnalysis ? "Re-analyze" : "Analyze"}
            </button>
            <button onClick={fetchData} disabled={isFetching}
              style={{
                background: isFetching ? "var(--bg-tertiary)" : "var(--accent)", border: "none", borderRadius: 6,
                color: isFetching ? "var(--text-muted)" : "#fff", padding: "6px 16px", cursor: isFetching ? "default" : "pointer", fontSize: 13, fontWeight: 600,
              }}
            >
              {isFetching ? "Loading..." : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {/* Loading bar */}
      {isFetching && !loading && (
        <div style={{ height: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: "40%", background: "var(--accent)",
            animation: "loadbar 1s ease-in-out infinite",
          }} />
          <style>{`@keyframes loadbar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
        </div>
      )}

      {/* Activity tab */}
      {activeTab === "activity" && <ProductivityDashboard />}

      {/* Repos tab */}
      {activeTab === "repos" && (
        <>
          {/* Search Bar */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Search PRs and issues across watched repos..."
              style={{
                flex: 1, background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 6,
                padding: "8px 12px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit",
              }}
            />
            <button onClick={doSearch} disabled={searching || !searchQuery.trim()}
              style={{
                background: searching ? "var(--bg-tertiary)" : "var(--accent)", border: "none", borderRadius: 6,
                color: "#fff", padding: "8px 16px", cursor: searching || !searchQuery.trim() ? "default" : "pointer",
                fontSize: 13, fontWeight: 600,
              }}
            >
              {searching ? "Searching..." : "Search"}
            </button>
            {searchResults && (
              <button onClick={clearSearch}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-secondary)", padding: "8px 12px", cursor: "pointer", fontSize: 13 }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
            {error && (
              <div style={{ background: "rgba(247,118,142,0.15)", border: "1px solid var(--error)", borderRadius: 8, padding: "10px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--error)", fontSize: 13 }}>{error}</span>
                <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer", fontSize: 14 }}>x</button>
              </div>
            )}
            {/* Bookmarks */}
            {!searchResults && bookmarkItems.length > 0 && (
              <div style={cardStyle}>
                <div style={cardHeader}>
                  <span>Bookmarked</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{bookmarkItems.length} items</span>
                </div>
                {bookmarkItems.map((b) => (
                  <div key={`${b.repo}:${b.item_type}:${b.item_number}`} style={itemStyle}>
                    <a href={b.url} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, textDecoration: "none" }}>
                      <span style={{ color: "var(--warning)", fontSize: 12 }}>★</span>
                      <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>{b.item_type.toUpperCase()}</span>
                      <span style={{ color: b.item_type === "pr" ? "var(--success)" : "var(--accent)", fontSize: 12, flexShrink: 0 }}>#{b.item_number}</span>
                      <span style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                    </a>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{b.repo}</span>
                      <button onClick={() => toggleBookmark(b.repo, b.item_type, b.item_number, b.title, b.url)} style={{ ...starBtnStyle, color: "var(--warning)" }}>★</button>
                      <button onClick={() => onInteract({ type: b.item_type, number: b.item_number, repo: b.repo, title: b.title })} style={interactBtnStyle}>&#x1F4AC;</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search Results */}
            {searchResults && (
              <SearchResults
                results={searchResults}
                onAnalyze={analyzeSearchResults}
                analyzing={analyzingSearch}
                analysis={searchAnalysis}
              />
            )}

            {/* Repo Cards (hidden during search) */}
            {!searchResults && (
              <>
                {data.length === 0 && !loading && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 80 }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>No watched repos</div>
                    <div style={{ fontSize: 14 }}>Add repos in the right panel to see their status here</div>
                  </div>
                )}
                {loading && data.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 80 }}>Fetching repo data...</div>
                )}
                {data.map((repo) => (
                  <RepoCard key={repo.repo} data={repo} analysis={analysis[repo.repo]} onInteract={onInteract} bookmarks={bookmarks} onToggleBookmark={toggleBookmark} />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
