import type { Agent, ModelOption, Skill } from "./types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function put<T>(url: string, body: unknown): Promise<T> {
  return json<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function post<T>(url: string, body: unknown): Promise<T> {
  return json<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Agents ---
export const fetchAgents = () => json<Agent[]>("/api/agents");
export const fetchRunningAgents = () => json<string[]>("/api/agents/running");
export const createAgent = (name: string) => post<Agent>("/api/agents", { name });
export const deleteAgent = (name: string) => fetch(`/api/agents/${name}`, { method: "DELETE" });

// --- Models & Config ---
export interface ConfigInfo {
  model: string;
  max_tokens: number;
  max_turns: number;
  google_cloud_region: string;
}

export const fetchModels = () => json<ModelOption[]>("/api/models");
export const fetchConfig = () => json<ConfigInfo>("/api/config");
export const updateConfig = (data: Partial<ConfigInfo>) => put<ConfigInfo>("/api/config", data);

// --- Skills ---
export const fetchSkills = () => json<Skill[]>("/api/skills");

// --- Repos ---
export const fetchRepos = () => json<string[]>("/api/repos");
export const updateRepos = (repos: string[]) => put<string[]>("/api/repos", { repos });

// --- Health ---
export interface HealthInfo {
  gh: { connected: boolean; detail: string };
  vertex: { connected: boolean; detail: string };
}
export const fetchHealth = () => json<HealthInfo>("/api/health");

// --- GitHub Auth (in-memory token) ---
export const getGithubTokenStatus = () => json<{ configured: boolean }>("/api/auth/github");
export const setGithubToken = (token: string) => post<{ ok: boolean }>("/api/auth/github", { token });
export const clearGithubToken = () => fetch("/api/auth/github", { method: "DELETE" });

// --- Settings ---
export const fetchSettings = () => json<Record<string, string>>("/api/settings");
export const updateSettings = (data: Record<string, string>) => put<Record<string, string>>("/api/settings", data);

// --- Activity ---
export const fetchActivity = (hours = 24) => json<any[]>(`/api/activity?hours=${hours}`);

// --- Events ---
export const fetchEvents = (limit = 20) => json<any[]>(`/api/events?limit=${limit}`);

// --- Dashboard ---
export const fetchDashboard = () => json<any[]>("/api/dashboard");
export const analyzeDashboard = (model: string) =>
  post<{ repo: string; analysis: any }[]>(`/api/dashboard/analyze?model=${encodeURIComponent(model)}`, {});
export const searchDashboard = (q: string) =>
  json<{ prs: any[]; issues: any[] }>(`/api/dashboard/search?q=${encodeURIComponent(q)}`);

// --- Bookmarks ---
export const fetchBookmarks = () => json<any[]>("/api/bookmarks");
export const addBookmark = (data: { repo: string; item_type: string; item_number: number; title: string; url: string }) =>
  post<any>("/api/bookmarks", data);
export const removeBookmark = (repo: string, itemType: string, itemNumber: number) =>
  fetch(`/api/bookmarks?repo=${encodeURIComponent(repo)}&item_type=${itemType}&item_number=${itemNumber}`, { method: "DELETE" });

// --- Productivity ---
export const fetchProductivity = (refresh = false) => json<any>(`/api/productivity${refresh ? "?refresh=true" : ""}`);

// --- Interact ---
export const interactAgent = (data: { type: string; number: number; repo: string; title: string }) =>
  post<{ agent_name: string; created: boolean }>("/api/interact", data);


// --- Query Keys ---
export const queryKeys = {
  agents: ["agents"] as const,
  runningAgents: ["agents", "running"] as const,
  models: ["models"] as const,
  config: ["config"] as const,
  skills: ["skills"] as const,
  repos: ["repos"] as const,
  health: ["health"] as const,
  settings: ["settings"] as const,
  activity: (hours: number) => ["activity", hours] as const,
  events: (limit: number) => ["events", limit] as const,
  dashboard: ["dashboard"] as const,
  bookmarks: ["bookmarks"] as const,
  productivity: ["productivity"] as const,
  githubAuth: ["auth", "github"] as const,
};
