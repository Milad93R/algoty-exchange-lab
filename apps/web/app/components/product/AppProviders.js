"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ViewStateContext = createContext(null);
const VIEW_STATE_KEY = "algoty-product-view";

function ViewStateProvider({ children }) {
  const [values, setValues] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_STATE_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        setValues(saved);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(values));
    } catch {}
  }, [hydrated, values]);

  const update = useCallback((key, next, initial) => {
    setValues((current) => {
      const previous = Object.hasOwn(current, key) ? current[key] : initial;
      return {
        ...current,
        [key]: typeof next === "function" ? next(previous) : next,
      };
    });
  }, []);
  const value = useMemo(() => ({ values, update }), [values, update]);
  return (
    <ViewStateContext.Provider value={value}>
      {children}
    </ViewStateContext.Provider>
  );
}

export function useViewState(key, initial) {
  const store = useContext(ViewStateContext);
  if (!store) throw Error("useViewState must be used inside AppProviders");
  const value = Object.hasOwn(store.values, key) ? store.values[key] : initial;
  const setValue = useCallback(
    (next) => store.update(key, next, initial),
    [store.update, key, initial],
  );
  return [value, setValue];
}

export default function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 30 * 60 * 1000,
            retry: 1,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ViewStateProvider>{children}</ViewStateProvider>
    </QueryClientProvider>
  );
}
