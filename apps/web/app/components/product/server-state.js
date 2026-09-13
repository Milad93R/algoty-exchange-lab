"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

async function candlePage(symbol, timeframe, endTime) {
  const query = new URLSearchParams({ symbol, timeframe });
  if (endTime) query.set("endTime", String(endTime));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`/api/candles?${query}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) {
      throw Error(
        response.status === 429
          ? "Chart history is loading too quickly. Try again in a moment."
          : data.error || "Unable to load chart history",
      );
    }
    return data;
  }
  throw Error("Unable to load chart history");
}

function mergeCandlePages(current, incoming, historical = false) {
  const candles = new Map();
  for (const row of current?.candles || []) candles.set(row.time, row);
  for (const row of incoming.candles || []) candles.set(row.time, row);
  const merged = [...candles.values()].sort((left, right) => left.time - right.time);
  return {
    ...current,
    ...incoming,
    candles: merged,
    hasMore: historical
      ? incoming.hasMore
      : current?.hasMore ?? incoming.hasMore,
    nextEndTime: merged.length ? merged[0].time - 1 : null,
  };
}

export function useCandles(symbol, timeframe) {
  const queryClient = useQueryClient();
  const refresh = CHART_TIMEFRAME_DETAILS[timeframe]?.refreshMs;
  const key = useMemo(
    () => dataKeys.candles(symbol, timeframe),
    [symbol, timeframe],
  );
  const loadingRef = useRef(false);
  const requestVersion = useRef(0);
  const [history, setHistory] = useState({ loading: false, error: null });

  useEffect(() => {
    requestVersion.current += 1;
    loadingRef.current = false;
    setHistory({ loading: false, error: null });
  }, [symbol, timeframe]);

  const result = useQuery({
    queryKey: key,
    queryFn: async () => {
      const incoming = await candlePage(symbol, timeframe);
      return mergeCandlePages(queryClient.getQueryData(key), incoming);
    },
    enabled: !!symbol && !!refresh,
    staleTime: refresh,
    refetchInterval: refresh,
    refetchIntervalInBackground: false,
  });

  const loadOlder = useCallback(async () => {
    if (loadingRef.current) return;
    const current = queryClient.getQueryData(key);
    if (!current?.candles?.length || current.hasMore === false) return;

    loadingRef.current = true;
    const version = requestVersion.current;
    setHistory({ loading: true, error: null });
    try {
      const older = await candlePage(
        symbol,
        timeframe,
        current.nextEndTime || current.candles[0].time - 1,
      );
      queryClient.setQueryData(key, (latest) =>
        mergeCandlePages(latest || current, older, true),
      );
    } catch (caught) {
      if (version === requestVersion.current) {
        setHistory({
          loading: false,
          error: caught?.message || "Unable to load earlier chart history",
        });
      }
    } finally {
      if (version === requestVersion.current) {
        loadingRef.current = false;
        setHistory((currentState) => ({ ...currentState, loading: false }));
      }
    }
  }, [key, queryClient, symbol, timeframe]);

  return {
    ...result,
    loadOlder,
    isFetchingOlder: history.loading,
    historyError: history.error,
    hasMore: result.data?.hasMore !== false,
  };
}
