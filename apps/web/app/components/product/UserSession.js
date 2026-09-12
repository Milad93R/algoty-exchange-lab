"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./client-api";

const UserContext = createContext(null);
const USER_CACHE_MS = 5 * 60 * 1000;

export function UserProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    error: "",
    status: "idle",
    checkedAt: 0,
  });
  const stateRef = useRef(state);
  const requestRef = useRef(null);

  const commit = useCallback((next) => {
    const current = stateRef.current;
    const value = typeof next === "function" ? next(current) : next;
    stateRef.current = value;
    setState(value);
  }, []);

  const ensureUser = useCallback(() => {
    const current = stateRef.current;
    if (
      current.status === "ready" &&
      Date.now() - current.checkedAt < USER_CACHE_MS
    ) {
      return Promise.resolve(current.user);
    }
    if (requestRef.current) return requestRef.current;

    commit({
      ...current,
      error: "",
      status: current.user ? "refreshing" : "loading",
    });
    const request = api("me")
      .catch(() => api("session", {}).then((d) => d.user))
      .then((user) => {
        commit({ user, error: "", status: "ready", checkedAt: Date.now() });
        return user;
      })
      .catch((error) => {
        commit((latest) => ({
          ...latest,
          error: error.message,
          status: latest.user ? "ready" : "error",
          checkedAt: Date.now(),
        }));
        throw error;
      })
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });
    requestRef.current = request;
    return request;
  }, [commit]);

  const setUser = useCallback(
    (next) => {
      commit((current) => ({
        user: typeof next === "function" ? next(current.user) : next,
        error: "",
        status: "ready",
        checkedAt: Date.now(),
      }));
    },
    [commit],
  );

  const value = useMemo(
    () => ({ ...state, setUser, ensureUser }),
    [state, setUser, ensureUser],
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const session = useContext(UserContext);
  if (!session) throw Error("useUser must be used inside UserProvider");
  useEffect(() => {
    session.ensureUser().catch(() => {});
  }, [session.ensureUser]);
  return {
    user: session.user,
    setUser: session.setUser,
    error: session.error,
    checking: session.status === "idle" || session.status === "loading",
  };
}
