"use client";
import Link from 'next/link';
import Brand from "../Brand";
import { useEffect, useState, useRef } from "react";
export const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
export const usd = (n) => "$" + fmt(Number(n) / 1e8);
export async function api(path, body) {
  const r = await fetch("/api/v2/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  let d;
  try {
    d = await r.json();
  } catch {
    throw Error(
      r.status === 429
        ? "Too many requests. Wait a moment and try again."
        : "Connection unavailable. Please retry shortly.",
    );
  }
  if (!r.ok) throw Error(d.error || d.message || "Request failed");
  return d;
}
export function useUser() {
  const [user, setUser] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api("me")
      .then((user) => ({ user }))
      .catch(() => api("session", {}))
      .then((d) => {
        if (live) setUser(d.user);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  return { user, setUser, error };
}
export function useMarket(symbol) {
  const [market, setMarket] = useState(null);
  useEffect(() => {
    setMarket(null);
    const source = new EventSource("/api/live?symbol=" + symbol);
    source.onmessage = (e) => {
      const d = JSON.parse(e.data);
      setMarket((old) => (d.error ? { ...old, ...d } : d));
    };
    source.onerror = () => setMarket((old) => ({ ...old, stale: true }));
    return () => source.close();
  }, [symbol]);
  return market;
}
export function Shell({ active, children, user }) {
  return (
    <div className="product">
      <header className="product-nav">
        <Brand/>
        <span className="product-mode">LIVE MARKET / PAPER CAPITAL</span>
        <nav>
          <Link className={active === "trade" ? "selected" : ""} href="/trade">
            Exchange
          </Link>
          <Link className={active === "agents" ? "selected" : ""} href="/agents">
            AI missions
          </Link>
          <Link href="/markets">Markets</Link>
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
export function Curve({ series = [], labels = [] }) {
  const vals = series.flat().map((x) => Number(x.equity));
  if (!vals.length)
    return (
      <div className="empty-curve">
        Performance starts with your first observation.
        <br />
        <small>Results are recorded while the mission runs.</small>
      </div>
    );
  const times = series.flat().map((x) => new Date(x.created_at).getTime());
  const start = Math.min(...times),
    end = Math.max(...times);
  let min = Math.min(...vals) * 0.999,
    max = Math.max(...vals) * 1.001;
  const point = (p) => [
    20 +
      ((new Date(p.created_at).getTime() - start) / Math.max(1, end - start)) *
        680,
    205 - ((p.equity - min) / (max - min)) * 180,
  ];
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
      </div>
    </div>
  );
}
export function barsFor(rows = [], tf = "1m") {
  if (tf === "1m") return rows;
  const groups = new Map();
  for (const r of rows) {
    const k = Math.floor(r.time / 300000);
    const a = groups.get(k) || [];
    a.push(r);
    groups.set(k, a);
  }
  return [...groups.entries()].map(([k, a]) => ({
    time: k * 300000,
    open: a[0].open,
    close: a.at(-1).close,
    high: Math.max(...a.map((r) => r.high)),
    low: Math.min(...a.map((r) => r.low)),
    volume: a.reduce((s, r) => s + r.volume, 0),
  }));
}
export function Candles({ rows = [], timeframe = "1m", level }) {
  const [hover, setHover] = useState(null),
    [count, setCount] = useState(70),
    [ma, setMa] = useState(false);
  const data = barsFor(rows, timeframe).slice(-count);
  if (!data.length)
    return (
      <div className="chart-skeleton">
        Connecting to live candles
        <span />
      </div>
    );
  const high = Math.max(...data.map((r) => r.high)),
    low = Math.min(...data.map((r) => r.low)),
    pad = (high - low) * 0.12 || 1,
    max = high + pad,
    min = low - pad;
  const y = (v) => 25 + ((max - v) / (max - min)) * 285;
  const w = 680 / data.length;
  const item = data[hover ?? data.length - 1] || data.at(-1),
    volume = Math.max(...data.map((r) => r.volume)) || 1;
  return (
    <div className="candle-wrap">
      <div className="chart-tools">
        <span>
          {new Date(item.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          <b>O</b> {fmt(item.open)} <b>H</b> {fmt(item.high)} <b>L</b>{" "}
          {fmt(item.low)} <b>C</b> {fmt(item.close)}
        </span>
        <button className={ma ? "on" : ""} onClick={() => setMa(!ma)}>
          SMA 20
        </button>
      </div>
      <svg
        viewBox="0 0 780 380"
        role="img"
        aria-label="Live candlestick chart"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.floor((((e.clientX - r.left) / r.width) * 780) / w),
              ),
            ),
          );
        }}
      >
        <g className="chart-grid">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <path d={`M0 ${30 + i * 68}H690`} />
              <text x="704" y={34 + i * 68}>
                {fmt(max - ((max - min) * i) / 4)}
              </text>
            </g>
          ))}
        </g>
        {data.map((r, i) => {
          const color = r.close >= r.open ? "#217d68" : "#d65b43";
          return (
            <g key={r.time} fill={color} stroke={color}>
              <line
                x1={i * w + w / 2}
                x2={i * w + w / 2}
                y1={y(r.high)}
                y2={y(r.low)}
              />
              <rect
                x={i * w + w * 0.2}
                y={y(Math.max(r.close, r.open))}
                width={Math.max(1, w * 0.6)}
                height={Math.max(1, Math.abs(y(r.open) - y(r.close)))}
              />
              <rect
                x={i * w + w * 0.2}
                y={357 - (r.volume / volume) * 37}
                width={Math.max(1, w * 0.6)}
                height={(r.volume / volume) * 37}
                opacity=".24"
                stroke="none"
              />
              {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
                <text className="axis-text" x={i * w} y="375" stroke="none">
                  {new Date(r.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </text>
              )}
            </g>
          );
        })}
        {ma && (
          <polyline
            stroke="#d7a349"
            strokeWidth="1.4"
            fill="none"
            points={data
              .map((r, i) => {
                const a = data.slice(Math.max(0, i - 19), i + 1);
                return `${i * w + w / 2},${y(a.reduce((s, v) => s + v.close, 0) / a.length)}`;
              })
              .join(" ")}
          />
        )}
        <path
          stroke="#728578"
          strokeDasharray="4 4"
          opacity=".6"
          d={`M0 ${y(data.at(-1).close)}H690`}
        />
        {level > min && level < max && (
          <path
            stroke="#e6653e"
            strokeDasharray="6 3"
            d={`M0 ${y(level)}H690`}
          />
        )}{" "}
        {hover !== null && (
          <path
            stroke="#768277"
            strokeDasharray="2 3"
            opacity=".6"
            d={`M${hover * w + w / 2} 15V355`}
          />
        )}
      </svg>
      <div className="chart-bottom">
        <span>BINANCE · {timeframe.toUpperCase()} CANDLES</span>
        <label>
          Visible bars{" "}
          <input
            aria-label="Visible candles"
            type="range"
            min="30"
            max="140"
            value={count}
            onChange={(e) => setCount(+e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
