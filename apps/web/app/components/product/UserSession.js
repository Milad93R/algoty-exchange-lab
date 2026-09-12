"use client";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client-api";
import { dataKeys } from "./server-state";

async function currentUser() {
  try {
    return await api("me");
  } catch {
    return (await api("session", {})).user;
  }
}

export function useUser() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dataKeys.user,
    queryFn: currentUser,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
    retry: 1,
  });
  const setUser = useCallback(
    (next) => {
      const current = queryClient.getQueryData(dataKeys.user);
      const value = typeof next === "function" ? next(current) : next;
      if (current?.id && current.id !== value?.id) {
        queryClient.removeQueries({
          predicate: (query) => query.queryKey[0] !== dataKeys.user[0],
        });
      }
      queryClient.setQueryData(dataKeys.user, value);
    },
    [queryClient],
  );
  return {
    user: query.data || null,
    setUser,
    error: query.error?.message || "",
    checking: query.isPending,
  };
}
