"use client";
import Link from 'next/link';
import { usePathname } from "next/navigation";
import Brand from "../Brand";
import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataKeys } from "./server-state";
export { api } from "./client-api";
export { useUser } from "./UserSession";
export { useViewState } from "./AppProviders";
export const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
export const usd = (n) => "$" + fmt(Number(n) / 1e8);

const marketStreams = new Map();
function subscribeMarket(symbol, queryClient) {
  let stream = marketStreams.get(symbol);
  if (stream && stream.queryClient !== queryClient) {
    clearTimeout(stream.closeTimer);
    stream.source.close();
    marketStreams.delete(symbol);
    stream = null;
  }
  if (!stream) {
    const source = new EventSource("/api/live?symbol=" + symbol);
    stream = { source, queryClient, subscribers: 0, closeTimer: null };
    marketStreams.set(symbol, stream);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        queryClient.setQueryData(dataKeys.market(symbol), (current) =>
          data.error ? { ...current, ...data } : data,
        );
      } catch {
        queryClient.setQueryData(dataKeys.market(symbol), (current) => ({
          ...current,
          stale: true,
        }));
      }
    };
    source.onerror = () =>
      queryClient.setQueryData(dataKeys.market(symbol), (current) => ({
        ...current,
        stale: true,
      }));
  }
  clearTimeout(stream.closeTimer);
  stream.subscribers += 1;
  return () => {
    stream.subscribers -= 1;
    if (stream.subscribers > 0) return;
    stream.closeTimer = setTimeout(() => {
      if (stream.subscribers > 0) return;
      stream.source.close();
      marketStreams.delete(symbol);
    }, 2_000);
  };
}

export function useMarket(symbol) {
  const queryClient = useQueryClient();
  const { data: market = null } = useQuery({
    queryKey: dataKeys.market(symbol),
    queryFn: () => Promise.resolve(null),
    enabled: false,
    gcTime: 30 * 60 * 1000,
  });
  useEffect(() => {
    return subscribeMarket(symbol, queryClient);
  }, [symbol, queryClient]);
  return market;
}
export function Shell({ children, user }) {
  const pathname = usePathname();
  return (
    <div className="product">
      <header className="product-nav">
        <Brand/>
        <span className="product-mode">LIVE MARKET / PAPER CAPITAL</span>
        <nav>
          <Link className={pathname === "/trade" ? "selected" : ""} href="/trade">
            Exchange
          </Link>
          <Link className={pathname === "/agents" ? "selected" : ""} href="/agents">
            AI missions
          </Link>
          <Link className={pathname === "/markets" ? "selected" : ""} href="/markets">
            Markets
          </Link>
        </nav>
        <Link className="account-link" href="/account">
          <span>{user?.name?.slice(0, 1) || "↗"}</span>
          {user?.registered ? user.name : "Save your account"}
        </Link>
      </header>
      <div className="product-body">{children}</div>
      <footer className="product-footer">
        <span>ALGOTY / A MORE CONSIDERED MOVE.</span>
        <span>Live Binance data · Virtual funds · 0.1% execution fee</span>
        <Link href="/agents">Meet your agent ↗</Link>
      </footer>
    </div>
  );
}
export function Notice({ text, clear }) {
  return text ? (
    <div className="product-notice" role="status">
      {text}
      {clear && (
        <button onClick={clear} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  ) : null;
}
export function useModal(active, onClose) {
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const nodes = () =>
      [
        ...(dialog?.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
        ) || []),
      ].filter((e) => e.offsetParent !== null);
    nodes()[0]?.focus();
    function key(e) {
      if (e.key === "Escape") callback.current();
      if (e.key === "Tab") {
        const list = nodes();
        if (!list.length) return;
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0].focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [active]);
}
export function Curve({ series = [], labels = [], markers = [], benchmark = null, empty = null }) {
  const vals = series.flat().map((x) => Number(x.equity));
  if (!vals.length)
    return (
      <div className="empty-curve">
        {empty || (
          <>
            Performance starts with your first observation.
            <br />
            <small>Results are recorded while the mission runs.</small>
          </>
        )}
      </div>
    );
  const all = benchmark ? [...series.flat(), ...benchmark] : series.flat();
  const times = all.map((x) => new Date(x.created_at).getTime());
  const allVals = all.map((x) => Number(x.equity));
  const start = Math.min(...times),
    end = Math.max(...times);
  let min = Math.min(...allVals) * 0.999,
    max = Math.max(...allVals) * 1.001;
  const point = (p) => [
    20 +
      ((new Date(p.created_at).getTime() - start) / Math.max(1, end - start)) *
        680,
    205 - ((p.equity - min) / (max - min)) * 180,
  ];
  const nearest = (t) => {
    const pts = series[0] || [];
    let best = pts[0];
    for (const q of pts)
      if (Math.abs(new Date(q.created_at).getTime() - t) < Math.abs(new Date(best.created_at).getTime() - t)) best = q;
    return best;
  };
  const baseline = series[0]?.[0]?.equity;
  return (
    <div className="comparison-curve">
      <svg
        viewBox="0 0 720 240"
        role="img"
        aria-label="Recorded virtual equity"
      >
        <g stroke="currentColor" opacity=".1">
          {[30, 80, 130, 180].map((y) => (
            <path key={y} d={"M0 " + y + "H720"} />
          ))}
        </g>
        {baseline !== undefined && baseline >= min && baseline <= max && (
          <path d={`M20 ${205 - ((baseline - min) / (max - min)) * 180}H700`} stroke="#8b9481" strokeDasharray="2 4" fill="none" />
        )}
        {benchmark && (
          <polyline
            fill="none"
            stroke="#8b9481"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            points={benchmark.map((p) => point(p).join(",")).join(" ")}
          />
        )}
        {series.map((points, i) => (
          <g key={i} fill={i ? "#465f69" : "#ed603c"}>
            <polyline
              fill="none"
              stroke="currentColor"
              style={{ color: i ? "#465f69" : "#ed603c" }}
              strokeWidth="2.5"
              points={points.map((p) => point(p).join(",")).join(" ")}
            />
            {points.length === 1 && (
              <circle cx={point(points[0])[0]} cy={point(points[0])[1]} r="3" />
            )}
          </g>
        ))}
        {markers.map((m, i) => {
          const q = nearest(new Date(m.created_at).getTime());
          if (!q) return null;
          const [x, y] = point({ ...q, created_at: m.created_at });
          const buy = m.side === "BUY";
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <title>{(buy ? "Buy " : "Sell ") + new Date(m.created_at).toLocaleString()}</title>
              <path d={buy ? "M0 -9 L5 -1 L-5 -1 Z" : "M0 9 L5 1 L-5 1 Z"} fill={buy ? "#487657" : "#bd4a2a"} />
            </g>
          );
        })}
        <text x="20" y="234" fill="#8b9481" fontSize="9">
          {new Date(start).toLocaleTimeString()}
        </text>
        <text x="700" y="234" textAnchor="end" fill="#8b9481" fontSize="9">
          {new Date(end).toLocaleTimeString()}
        </text>
      </svg>
      <div>
        {labels.map((name, i) => (
          <span key={i} style={{ color: i ? "#465f69" : "#dc5633" }}>
            ● {name}
          </span>
        ))}
        {benchmark && <span style={{ color: "#8b9481" }}>╌ Buy &amp; hold</span>}
        {markers.length > 0 && <span style={{ color: "#487657" }}>▲ Buy</span>}
        {markers.length > 0 && <span style={{ color: "#bd4a2a" }}>▼ Sell</span>}
      </div>
    </div>
  );
}
