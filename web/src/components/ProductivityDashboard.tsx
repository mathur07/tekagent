import { useState } from "react";
import { useProductivity } from "../lib/queries";

interface ContributionDay {
  contributionCount: number;
  date: string;
  weekday: number;
}

interface Week {
  contributionDays: ContributionDay[];
}

interface Contributions {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  contributionCalendar: {
    totalContributions: number;
    weeks: Week[];
  };
}

interface PRItem {
  number: number;
  title: string;
  url: string;
  state: string;
  repo: string;
  updated_at: string;
}

interface CommentItem {
  type: string;
  repo: string;
  number: number | null;
  body: string;
  url: string;
  created_at: string;
}

interface AwaitingReviewItem {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  author_avatar: string;
  updated_at: string;
}

interface TopRepo {
  repo: string;
  count: number;
}

interface ProductivityData {
  login: string;
  profile: {
    login: string;
    name: string;
    avatar_url: string;
    public_repos: number;
    followers: number;
  };
  contributions: Contributions | null;
  pr_stats: {
    merged_30d: number;
    open: number;
    reviewed_30d: number;
  };
  recent_prs: PRItem[];
  recent_reviews: PRItem[];
  recent_comments: CommentItem[];
  awaiting_review: AwaitingReviewItem[];
  top_repos: TopRepo[];
  dora_metrics?: {
    cycle_time_median_hours: number;
    cycle_time_p90_hours: number;
    review_depth_avg_comments: number;
    weekly_throughput: number;
    total_merged_8w: number;
    sample_size: number;
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function computeStreak(weeks: Week[]): number {
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  for (let i = allDays.length - 1; i >= 0; i--) {
    if (allDays[i].date > today) continue;
    if (allDays[i].contributionCount > 0) {
      streak++;
    } else {
      if (allDays[i].date === today) continue;
      break;
    }
  }
  return streak;
}

/* ---------- Stat Card ---------- */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 110, background: "var(--bg-secondary)",
      border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ---------- Weekly Trend Bars ---------- */

function WeeklyTrend({ weeks }: { weeks: Week[] }) {
  const last12 = weeks.slice(-12);
  const sums = last12.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0));
  const max = Math.max(...sums, 1);

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Weekly trend (last 12 weeks)
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
        {sums.map((count, i) => {
          const h = Math.max((count / max) * 56, 2);
          const weekStart = last12[i].contributionDays[0]?.date || "";
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                title={`${count} contributions · week of ${weekStart}`}
                style={{
                  width: "100%", maxWidth: 40, height: h, borderRadius: 3,
                  background: count > 0 ? "#26a641" : "var(--bg-tertiary)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {last12.map((w, i) => {
          const d = w.contributionDays[0]?.date || "";
          const label = d ? new Date(d + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : "";
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--text-muted)" }}>
              {i % 2 === 0 ? label : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Daily View (last 30 days) ---------- */

function DailyView({ weeks }: { weeks: Week[] }) {
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toISOString().slice(0, 10);
  const last30 = allDays.filter((d) => d.date <= today).slice(-30);
  const max = Math.max(...last30.map((d) => d.contributionCount), 1);

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Daily contributions (last 30 days)
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
        {last30.map((day) => {
          const h = Math.max((day.contributionCount / max) * 72, 2);
          const d = new Date(day.date + "T00:00:00");
          const label = d.toLocaleDateString("en", { month: "short", day: "numeric" });
          return (
            <div
              key={day.date}
              title={`${day.contributionCount} contributions on ${label}`}
              style={{
                flex: 1, height: h, borderRadius: 2,
                background: day.contributionCount > 0 ? "#26a641" : "var(--bg-tertiary)",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {last30.map((day, i) => {
          const d = new Date(day.date + "T00:00:00");
          const label = d.toLocaleDateString("en", { month: "short", day: "numeric" });
          return (
            <div key={day.date} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--text-muted)" }}>
              {i % 5 === 0 ? label : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Contribution Heatmap ---------- */

const HEATMAP_COLORS = ["#1a1b26", "#0e4429", "#006d32", "#26a641", "#39d353"];

function getHeatmapColor(count: number, max: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  const ratio = count / Math.max(max, 1);
  if (ratio < 0.25) return HEATMAP_COLORS[1];
  if (ratio < 0.5) return HEATMAP_COLORS[2];
  if (ratio < 0.75) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

function ContributionHeatmap({ weeks }: { weeks: Week[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const allCounts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount));
  const max = Math.max(...allCounts, 1);

  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const firstDay = w.contributionDays[0];
    if (!firstDay) return;
    const month = new Date(firstDay.date + "T00:00:00").getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        label: new Date(firstDay.date + "T00:00:00").toLocaleDateString("en", { month: "short" }),
        col: wi,
      });
      lastMonth = month;
    }
  });

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Contribution heatmap
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ marginRight: 4, paddingTop: 14 }}>
          <div style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 2, height: 84 }}>
            {dayLabels.map((label, i) => (
              <div key={i} style={{ fontSize: 8, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 2 }}>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Month labels */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, gap: 1, marginBottom: 2, height: 12 }}>
            {weeks.map((_week, wi) => {
              const ml = monthLabels.find((m) => m.col === wi);
              return (
                <div key={wi} style={{ fontSize: 8, color: "var(--text-muted)", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {ml ? ml.label : ""}
                </div>
              );
            })}
          </div>
          {/* Cell grid — column-major via gridAutoFlow */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
            gridTemplateRows: "repeat(7, 1fr)",
            gridAutoFlow: "column",
            gap: 2,
            height: 84,
          }}>
            {weeks.flatMap((week, wi) =>
              week.contributionDays.map((day, di) => (
                <div
                  key={`${wi}-${di}`}
                  onMouseEnter={(e) => {
                    const d = new Date(day.date + "T00:00:00");
                    const formatted = d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
                    setTooltip({ x: e.clientX, y: e.clientY, text: `${day.contributionCount} contributions on ${formatted}` });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    borderRadius: 2,
                    background: getHeatmapColor(day.contributionCount, max),
                  }}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 12, top: tooltip.y - 36, zIndex: 1000,
          background: "var(--bg-tertiary)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "4px 10px", fontSize: 11,
          color: "var(--text-primary)", pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

/* ---------- Contribution Radar Chart ---------- */

function ContributionRadar({ contributions }: { contributions: Contributions }) {
  const items = [
    { label: "Commits", value: contributions.totalCommitContributions },
    { label: "PRs", value: contributions.totalPullRequestContributions },
    { label: "Reviews", value: contributions.totalPullRequestReviewContributions },
    { label: "Issues", value: contributions.totalIssueContributions },
  ];
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const R = 50;
  const axes = items.length;
  const angleStep = (2 * Math.PI) / axes;
  const startAngle = -Math.PI / 2;

  const axisPoints = items.map((_, i) => {
    const angle = startAngle + i * angleStep;
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  const dataPoints = items.map((item, i) => {
    const angle = startAngle + i * angleStep;
    const r = (item.value / maxVal) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const rings = [0.33, 0.66, 1];

  const labelOffsets: { dx: number; dy: number; anchor: "middle" | "start" | "end" }[] = [
    { dx: 0, dy: -10, anchor: "middle" },
    { dx: 10, dy: 4, anchor: "start" },
    { dx: 0, dy: 16, anchor: "middle" },
    { dx: -10, dy: 4, anchor: "end" },
  ];

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "12px 14px", flexShrink: 0,
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px", alignSelf: "flex-start" }}>
        Breakdown
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((r) => (
          <polygon
            key={r}
            points={Array.from({ length: axes }, (_, i) => {
              const angle = startAngle + i * angleStep;
              return `${cx + R * r * Math.cos(angle)},${cy + R * r * Math.sin(angle)}`;
            }).join(" ")}
            fill="none"
            stroke="var(--border)"
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}
        {axisPoints.map((p, i) => (
          <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />
        ))}
        <polygon points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(38,166,65,0.25)" stroke="#26a641" strokeWidth={1.5} />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#26a641" stroke="var(--bg-secondary)" strokeWidth={1} />
        ))}
        {axisPoints.map((p, i) => {
          const pct = Math.round((items[i].value / total) * 100);
          const off = labelOffsets[i];
          return (
            <text
              key={i}
              x={p.x + off.dx}
              y={p.y + off.dy}
              textAnchor={off.anchor}
              style={{ fontSize: 9, fill: "var(--text-secondary)" }}
            >
              <tspan x={p.x + off.dx} dy="0" style={{ fontWeight: 600 }}>{pct}%</tspan>
              <tspan x={p.x + off.dx} dy="11" style={{ fontSize: 8 }}>{items[i].label}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- Top Repos ---------- */

function TopRepos({ repos }: { repos: TopRepo[] }) {
  if (repos.length === 0) return null;
  const max = repos[0]?.count || 1;

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Top repos (this year)
      </div>
      {repos.map((r) => (
        <div key={r.repo} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <a
            href={`https://github.com/${r.repo}`}
            target="_blank"
            rel="noopener"
            style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", minWidth: 0, width: 220, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {r.repo}
          </a>
          <div style={{ flex: 1, height: 8, background: "var(--bg-tertiary)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "#26a641", borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 30, textAlign: "right" }}>{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Recent PR Row ---------- */

const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
  merged: { bg: "rgba(158,206,106,0.15)", color: "var(--success)", label: "merged" },
  open: { bg: "rgba(122,162,247,0.15)", color: "var(--accent)", label: "open" },
  closed: { bg: "rgba(247,118,142,0.15)", color: "var(--error)", label: "closed" },
};

function RecentPRRow({ pr }: { pr: PRItem }) {
  const s = statusStyles[pr.state] || statusStyles.closed;
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener"
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
        textDecoration: "none", borderBottom: "1px solid var(--border)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 100, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {pr.repo.split("/").pop()}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>#{pr.number}</span>
      <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {pr.title}
      </span>
      <span style={{
        fontSize: 10, padding: "1px 6px", borderRadius: 4,
        background: s.bg, color: s.color, flexShrink: 0,
      }}>
        {s.label}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, minWidth: 48, textAlign: "right" }}>
        {timeAgo(pr.updated_at)}
      </span>
    </a>
  );
}

/* ---------- Main Dashboard ---------- */

export function ProductivityDashboard() {
  const { data: rawData, isLoading: loading, isFetching, refetch, error: queryError } = useProductivity();
  const data = rawData as ProductivityData | undefined;
  const error = queryError?.message || (rawData as any)?.error || null;

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        Loading productivity data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--error)" }}>
        {error || "Failed to load data"}
      </div>
    );
  }

  const c = data.contributions;
  const cal = c?.contributionCalendar;
  const streak = cal ? computeStreak(cal.weeks) : 0;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", minWidth: 0 }}>
      {/* Profile strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <img
          src={data.profile.avatar_url}
          alt={data.profile.login}
          style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid var(--border)" }}
        />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{data.profile.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{data.profile.login}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>
              {cal?.totalContributions.toLocaleString() || 0}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>contributions this year</div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              background: isFetching ? "var(--bg-tertiary)" : "var(--accent)",
              border: "none",
              borderRadius: 6,
              color: isFetching ? "var(--text-muted)" : "#fff",
              padding: "6px 14px",
              cursor: isFetching ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {isFetching ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Stat cards + Radar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatCard label="Total contributions" value={cal?.totalContributions || 0} sub="this year" />
          <StatCard label="Streak" value={`${streak}d`} sub="consecutive days" />
          <StatCard label="Commits" value={c?.totalCommitContributions || 0} sub="this year" />
          <StatCard label="PRs merged" value={data.pr_stats.merged_30d} sub="last 30 days" />
          <StatCard label="Reviews given" value={data.pr_stats.reviewed_30d} sub="last 30 days" />
          <StatCard label="Open PRs" value={data.pr_stats.open} />
        </div>
        {c && <ContributionRadar contributions={c} />}
      </div>

      {/* Daily + Weekly trend side by side */}
      {cal && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <DailyView weeks={cal.weeks} />
          <WeeklyTrend weeks={cal.weeks} />
        </div>
      )}

      {/* Heatmap */}
      {cal && <div style={{ marginBottom: 12 }}><ContributionHeatmap weeks={cal.weeks} /></div>}

      {/* DORA Metrics */}
      {data.dora_metrics && data.dora_metrics.sample_size > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Engineering Metrics (30d)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { label: "Cycle Time (median)", value: `${data.dora_metrics.cycle_time_median_hours}h`, color: data.dora_metrics.cycle_time_median_hours < 24 ? "var(--success)" : data.dora_metrics.cycle_time_median_hours < 72 ? "var(--warning)" : "var(--error)" },
              { label: "Cycle Time (p90)", value: `${data.dora_metrics.cycle_time_p90_hours}h`, color: data.dora_metrics.cycle_time_p90_hours < 48 ? "var(--success)" : data.dora_metrics.cycle_time_p90_hours < 168 ? "var(--warning)" : "var(--error)" },
              { label: "PRs / week", value: `${data.dora_metrics.weekly_throughput}`, color: "var(--accent)" },
              { label: "Review depth", value: `${data.dora_metrics.review_depth_avg_comments} comments`, color: "var(--text-primary)" },
            ].map((m) => (
              <div key={m.label} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top repos */}
      {data.top_repos.length > 0 && <div style={{ marginBottom: 12 }}><TopRepos repos={data.top_repos} /></div>}

      {/* Recent activity — stacked */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.awaiting_review.length > 0 && (
          <div style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                PRs Awaiting My Review
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, background: "rgba(224,175,104,0.2)",
                color: "var(--warning)", padding: "1px 6px", borderRadius: 8,
              }}>
                {data.awaiting_review.length}
              </span>
            </div>
            {data.awaiting_review.map((pr) => (
              <a
                key={`${pr.repo}-${pr.number}`}
                href={pr.url}
                target="_blank"
                rel="noopener"
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                  textDecoration: "none", borderBottom: "1px solid var(--border)",
                }}
              >
                <img
                  src={pr.author_avatar}
                  alt={pr.author}
                  title={pr.author}
                  style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0 }}
                />
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, minWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pr.repo.includes("/") ? pr.repo.split("/").pop() : pr.repo}
                </span>
                <span style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>#{pr.number}</span>
                <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pr.title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, minWidth: 48, textAlign: "right" }}>
                  {timeAgo(pr.updated_at)}
                </span>
              </a>
            ))}
          </div>
        )}
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "16px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            My PRs
          </div>
          {data.recent_prs.length === 0
            ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No recent PRs</div>
            : data.recent_prs.map((pr) => <RecentPRRow key={`${pr.repo}-${pr.number}`} pr={pr} />)
          }
        </div>
        <div style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "16px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            My Reviews
          </div>
          {data.recent_reviews.length === 0
            ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No recent reviews</div>
            : data.recent_reviews.map((pr) => <RecentPRRow key={`${pr.repo}-${pr.number}`} pr={pr} />)
          }
        </div>

        {data.recent_comments.length > 0 && (
          <div style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "16px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Recent Comments
            </div>
            {data.recent_comments.map((c, i) => (
              <a
                key={i}
                href={c.url}
                target="_blank"
                rel="noopener"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
                  textDecoration: "none", borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{
                  fontSize: 9, padding: "2px 5px", borderRadius: 3, flexShrink: 0, marginTop: 2,
                  background: c.type === "review" ? "rgba(158,206,106,0.15)" : "rgba(122,162,247,0.15)",
                  color: c.type === "review" ? "var(--success)" : "var(--accent)",
                }}>
                  {c.type}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {c.repo.includes("/") ? c.repo.split("/").pop() : c.repo}
                  {c.number ? ` #${c.number}` : ""}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.body || "(no body)"}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, minWidth: 48, textAlign: "right", marginTop: 2 }}>
                  {timeAgo(c.created_at)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
