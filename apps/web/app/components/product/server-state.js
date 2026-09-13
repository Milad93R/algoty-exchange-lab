"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client-api";
import { CHART_TIMEFRAME_DETAILS } from "./market-config";

export const dataKeys = {
  user: ["session-user"],
  portfolio: (userId) => ["portfolio", userId],
  missions: (userId) => ["missions", userId],
  mission: (userId, missionId) => ["mission", userId, missionId],
  comparison: (userId, groupId) => ["comparison", userId, groupId],
  accountSessions: (userId) => ["account-sessions", userId],
  market: (symbol) => ["live-market", symbol],
  candles: (symbol, timeframe) => ["market-candles", symbol, timeframe],
  replay: (missionId, planKey, slippageBps) => [
    "mission-replay",
    missionId,
    planKey,
    slippageBps,
  ],
  scan: (missionId, planKey) => ["mission-scan", missionId, planKey],
};

export function usePortfolio(userId) {
  return useQuery({
    queryKey: dataKeys.portfolio(userId),
    queryFn: () => api("portfolio"),
    enabled: !!userId,
    staleTime: 10_000,
    refetchInterval: userId ? 3_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useMissions(userId) {
  return useQuery({
    queryKey: dataKeys.missions(userId),
    queryFn: () => api("missions"),
    enabled: !!userId,
    staleTime: 10_000,
    refetchInterval: userId ? 6_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useMission(userId, missionId) {
  return useQuery({
    queryKey: dataKeys.mission(userId, missionId),
    queryFn: () => api("missions/" + missionId),
    enabled: !!userId && !!missionId,
    staleTime: 10_000,
    refetchInterval: userId && missionId ? 6_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useComparison(userId, groupId) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: dataKeys.comparison(userId, groupId),
    queryFn: async () => {
      let rows = queryClient.getQueryData(dataKeys.missions(userId));
      if (!rows) rows = await api("missions");
      const members = rows.filter((row) => row.group_id === groupId);
      return {
        group: groupId,
        agents: await Promise.all(
          members.map((row) => api("missions/" + row.id)),
        ),
      };
    },
    enabled: !!userId && !!groupId,
    staleTime: 10_000,
    refetchInterval: userId && groupId ? 6_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useAccountSessions(userId) {
  return useQuery({
    queryKey: dataKeys.accountSessions(userId),
    queryFn: () => api("account/sessions"),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useCandles(symbol, timeframe) {
  const refresh = CHART_TIMEFRAME_DETAILS[timeframe]?.refreshMs;
  return useQuery({
    queryKey: dataKeys.candles(symbol, timeframe),
    queryFn: async () => {
      const query = new URLSearchParams({ symbol, timeframe });
      const response = await fetch(`/api/candles?${query}`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to load chart history");
      return data;
    },
    enabled: !!symbol && !!refresh,
    staleTime: refresh,
    refetchInterval: refresh,
    refetchIntervalInBackground: false,
  });
}
