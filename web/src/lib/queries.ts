import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

// --- Read hooks ---

export function useAgents() {
  return useQuery({ queryKey: api.queryKeys.agents, queryFn: api.fetchAgents });
}

export function useRunningAgents() {
  return useQuery({
    queryKey: api.queryKeys.runningAgents,
    queryFn: api.fetchRunningAgents,
    refetchInterval: 3000,
  });
}

export function useModels() {
  return useQuery({
    queryKey: api.queryKeys.models,
    queryFn: api.fetchModels,
    staleTime: Infinity,
  });
}

export function useConfig() {
  return useQuery({ queryKey: api.queryKeys.config, queryFn: api.fetchConfig });
}

export function useSkills() {
  return useQuery({
    queryKey: api.queryKeys.skills,
    queryFn: api.fetchSkills,
    staleTime: 60_000,
  });
}

export function useRepos() {
  return useQuery({ queryKey: api.queryKeys.repos, queryFn: api.fetchRepos });
}

export function useHealth() {
  return useQuery({ queryKey: api.queryKeys.health, queryFn: api.fetchHealth });
}

export function useSettings() {
  return useQuery({ queryKey: api.queryKeys.settings, queryFn: api.fetchSettings });
}

export function useActivity(hours = 24) {
  return useQuery({
    queryKey: api.queryKeys.activity(hours),
    queryFn: () => api.fetchActivity(hours),
  });
}

export function useEvents(limit = 20) {
  return useQuery({
    queryKey: api.queryKeys.events(limit),
    queryFn: () => api.fetchEvents(limit),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: api.queryKeys.dashboard,
    queryFn: api.fetchDashboard,
    staleTime: 30_000,
  });
}

export function useBookmarks() {
  return useQuery({ queryKey: api.queryKeys.bookmarks, queryFn: api.fetchBookmarks });
}

export function useProductivity() {
  return useQuery({
    queryKey: api.queryKeys.productivity,
    queryFn: api.fetchProductivity,
    staleTime: 60_000,
  });
}

export function useGithubAuthStatus() {
  return useQuery({
    queryKey: api.queryKeys.githubAuth,
    queryFn: api.getGithubTokenStatus,
  });
}

// --- Mutation hooks ---

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createAgent(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.agents }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteAgent(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.agents }),
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<api.ConfigInfo>) => api.updateConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.config }),
  });
}

export function useUpdateRepos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repos: string[]) => api.updateRepos(repos),
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.repos }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.settings }),
  });
}

export function useSetGithubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.setGithubToken(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: api.queryKeys.githubAuth });
      qc.invalidateQueries({ queryKey: api.queryKeys.health });
    },
  });
}

export function useClearGithubToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearGithubToken(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: api.queryKeys.githubAuth });
      qc.invalidateQueries({ queryKey: api.queryKeys.health });
    },
  });
}

export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { repo: string; itemType: string; itemNumber: number; title: string; url: string; isBookmarked: boolean }) => {
      if (args.isBookmarked) {
        await api.removeBookmark(args.repo, args.itemType, args.itemNumber);
      } else {
        await api.addBookmark({ repo: args.repo, item_type: args.itemType, item_number: args.itemNumber, title: args.title, url: args.url });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: api.queryKeys.bookmarks }),
  });
}
