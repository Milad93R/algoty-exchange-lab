"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MissionCanvas from "./MissionCanvas";
import { api, Curve, fmt, useViewState } from "./common";
import { dataKeys } from "./server-state";
import {
  GROUPS,
  KINDS,
  PARAM_DEFAULTS,
  paramDefault,
  PARAM_LABELS,
  PATTERNS,
  PATTERN_GROUPS,
  PATTERN_NAMES,
  SWING_PATTERN_SET,
  DIVERGENCE_SET,
  DISPLACEMENT_SET,
  PARAM_RANGES,
  SESSIONS,
  MOD_FUNCTIONS,
  OPS as ops,
  WORDS as words,
  describeOperand as val,
  describeNode as label,
} from "./library.mjs";
const id = () => "n_" + Math.random().toString(36).slice(2, 10);
const leaf = () => ({
  id: id(),
  op: "gt",
  left: { kind: "close" },
  right: { kind: "ema", period: 20 },
});
export function template(kind = "trend") {
  const entry =
    kind === "reversal"
      ? {
          id: id(),
          op: "crossAbove",
          left: { kind: "rsi", period: 14 },
          right: 30,
        }
      : kind === "breakout"
        ? {
            id: id(),
            op: "gt",
            left: { kind: "close" },
            right: { kind: "highest", period: 20, offset: 1 },
          }
        : leaf();
  return {
    version: 1,
    entry: {
      id: id(),
      op: "all",
      children: [
        entry,
        {
          id: id(),
          op: "gt",
          left: { kind: "volumeRatio", period: 20 },
          right: 1.2,
        },
      ],
    },
    exit: {
      id: id(),
      op: "lt",
      left: { kind: "close" },
      right: { kind: "ema", period: 20 },
    },
    risk: {
      maxEntries: 1,
      exitPercent: 100,
      trailingPct: 0,
      cooldownBars: 3,
      dailyLossPct: 5,
    },
  };
}
export function starter(kind) {
  return {
    name:
      kind === "reversal"
        ? "The turning point"
        : kind === "breakout"
          ? "Beyond the range"
          : "Follow the current",
    symbol: "BTCUSDT",
    strategy: "CUSTOM",
    timeframe: "1m",
    lookback: 20,
    fast: 5,
    slow: 20,
    volumeRatio: 1.2,
    confirmationBars: 1,
    orderQuote: 300,
    maxPositionQuote: 1000,
    dailyTrades: 4,
    stopLossPct: 2,
    takeProfitPct: 4,
    durationHours: 24,
    questions: [],
    summary:
      "A composable starting point. Inspect each condition, then make it your own.",
    flow: template(kind),
  };
}
function children(n) {
  return n.children || (n.child ? [n.child] : []);
}
function find(flow, key) {
  let found;
  function walk(n) {
    if (n.id === key) found = n;
    children(n).forEach(walk);
  }
  walk(flow.entry);
  walk(flow.exit);
  return found;
}
function change(flow, key, fn) {
  const f = structuredClone(flow);
  const n = find(f, key);
  if (n) fn(n);
  return f;
}
function Operand({ value, onChange, depth = 0 }) {
  const numeric = typeof value === "number";
  const isMod = !numeric && value.kind === "mod";
  const meta = numeric || isMod ? null : KINDS[value.kind];
  if (isMod)
    return (
      <div className="operand operand-mod">
        <select
          aria-label="Value source"
          value="mod"
          onChange={(e) => {
            const kind = e.target.value;
            if (kind === "number") return onChange(0);
            if (kind === "mod") return;
            const next = { kind };
            for (const p of KINDS[kind].params) next[p] = paramDefault(kind, p);
            onChange(next);
          }}
        >
          <option value="number">Fixed value</option>
          <option value="mod">Modifier of a value</option>
          {GROUPS.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.kinds.map(([k, name]) => (
                <option key={k} value={k}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Modifier" value={value.fn} onChange={(e) => onChange({ ...value, fn: e.target.value, length: e.target.value === "lookback" ? Math.max(1, value.length || 1) : Math.max(2, value.length || 5) })}>
          {MOD_FUNCTIONS.map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
        <small className="operand-help">{MOD_FUNCTIONS.find(([k]) => k === value.fn)?.[2]}</small>
        <label>
          {value.fn === "lookback" ? "Bars ago" : "Bars"}
          <input type="number" min={value.fn === "lookback" ? 1 : 2} max="50" value={value.length} onChange={(e) => onChange({ ...value, length: Number(e.target.value) })} />
        </label>
        {value.fn === "average" && (
          <label>
            Average type
            <select aria-label="Average type" value={value.ma || "sma"} onChange={(e) => onChange({ ...value, ma: e.target.value })}>
              {["sma", "ema", "hma"].map((k) => (
                <option key={k} value={k}>
                  {k.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="operand-inner">
          <span className="overline">OF THIS VALUE</span>
          <Operand value={value.of} onChange={(v) => onChange({ ...value, of: v })} depth={depth + 1} />
        </div>
      </div>
    );
  return (
    <div className="operand">
      <select
        aria-label="Value source"
        value={numeric ? "number" : value.kind}
        onChange={(e) => {
          const kind = e.target.value;
          if (kind === "number") return onChange(0);
          if (kind === "mod") return onChange({ kind: "mod", fn: "average", length: 5, of: numeric ? { kind: "close" } : value });
          const next = { kind };
          for (const p of KINDS[kind].params) next[p] = paramDefault(kind, p);
          if (!numeric) for (const k of ["offset", "symbol", "timeframe"]) if (value[k]) next[k] = value[k];
          onChange(next);
        }}
      >
        <option value="number">Fixed value</option>
        {depth < 2 && <option value="mod">Modifier of a value</option>}
        {GROUPS.map((g) => (
          <optgroup key={g.name} label={g.name}>
            {g.kinds.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {numeric ? (
        <input
          aria-label="Threshold"
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : (
        <>
          {meta?.help && <small className="operand-help">{meta.help}</small>}
          {meta?.params.map((p) =>
            p === "session" ? (
              <label key={p}>
                {PARAM_LABELS[p]}
                <select aria-label="Session" value={value.session || "london"} onChange={(e) => onChange({ ...value, session: e.target.value })}>
                  {SESSIONS.map((k) => (
                    <option key={k} value={k}>
                      {k === "newyork" ? "New York" : k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label key={p}>
                {PARAM_LABELS[p]}
                <input
                  type="number"
                  min={PARAM_RANGES[p]?.[0] ?? 2}
                  max={PARAM_RANGES[p]?.[1] ?? 200}
                  step={PARAM_RANGES[p]?.[2] ?? 1}
                  value={value[p] ?? paramDefault(value.kind, p)}
                  onChange={(e) => onChange({ ...value, [p]: Number(e.target.value) })}
                />
              </label>
            ),
          )}
          <label>
            Previous bars
            <input
              type="number"
              min="0"
              max="50"
              value={value.offset || 0}
              onChange={(e) =>
                onChange({ ...value, offset: Number(e.target.value) })
              }
            />
          </label>
          <select
            aria-label="Indicator market"
            value={value.symbol || ""}
            onChange={(e) => {
              const v = { ...value };
              if (e.target.value) v.symbol = e.target.value;
              else delete v.symbol;
              onChange(v);
            }}
          >
            <option value="">Mission market</option>
            {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select
            aria-label="Indicator timeframe"
            value={value.timeframe || ""}
            onChange={(e) => {
              const v = { ...value };
              if (e.target.value) v.timeframe = e.target.value;
              else delete v.timeframe;
              onChange(v);
            }}
          >
            <option value="">Mission timeframe</option>
            {["1m", "5m", "15m", "1h"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
export function FlowEditor({ flow, onChange }) {
  const [selected, setSelected] = useState(flow.entry.id);
  const n = find(flow, selected) || flow.entry;
  function update(k, v) {
    onChange(change(flow, n.id, (x) => (x[k] = v)));
  }
  function operator(op) {
    onChange(
      change(flow, n.id, (x) => {
        const keep = x.id,
          previous = { ...x };
        Object.keys(x).forEach((k) => delete x[k]);
        Object.assign(x, { id: keep, op });
        if (["all", "any", "sequence"].includes(op)) {
          x.children = previous.children || [previous.child || leaf(), leaf()];
          if (op === "sequence") x.within = 5;
        } else if (["not", "consecutive"].includes(op)) {
          x.child = previous.child || previous.children?.[0] || leaf();
          if (op === "consecutive") x.bars = 2;
        } else if (op === "schedule") {
          x.startHour = 0;
          x.endHour = 24;
        } else if (op === "pattern") {
          x.name = previous.name || "bullishEngulfing";
        } else if (op === "rising" || op === "falling") {
          x.left = previous.left ?? { kind: "ema", period: 20 };
          x.bars = previous.bars || 3;
        } else if (op === "formula") {
          x.left = previous.left ?? { kind: "close" };
          x.right = previous.right ?? { kind: "sma", period: 20 };
          x.expr = previous.expr || "a/b > 1.02";
        } else {
          x.left = previous.left ?? { kind: "close" };
          x.right = previous.right ?? { kind: "ema", period: 20 };
        }
      }),
    );
  }
  return (
    <div className="flow-editor">
      <FlowGraph flow={flow} selected={n.id} onSelect={setSelected} />
      <div className="node-inspector">
        <span className="overline">EDIT THE RULE</span>
        <h3>{label(n)}</h3>
        <label>
          Logic
          <select
            aria-label="Rule operator"
            value={n.op}
            onChange={(e) => operator(e.target.value)}
          >
            {ops.map((o) => (
              <option key={o} value={o}>
                {words[o]}
              </option>
            ))}
          </select>
        </label>
        {n.left !== undefined && (
          <>
            <span className="overline">{n.right !== undefined ? "LEFT SIDE" : "WATCH THIS VALUE"}</span>
            <Operand value={n.left} onChange={(v) => update("left", v)} />
            {n.right !== undefined && (
              <>
                <span className="overline">RIGHT SIDE</span>
                <Operand value={n.right} onChange={(v) => update("right", v)} />
              </>
            )}
          </>
        )}
        {n.op === "pattern" && (
          <>
            <label>
              Pattern
              <select
                aria-label="Candle pattern"
                value={n.name}
                onChange={(e) => update("name", e.target.value)}
              >
                {PATTERN_GROUPS.map(([group, names]) => (
                  <optgroup key={group} label={group}>
                    {names.map((k) => (
                      <option key={k} value={k}>
                        {PATTERN_NAMES[k]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <small className="operand-help">{PATTERNS.find(([k]) => k === n.name)?.[2]}</small>
            {DIVERGENCE_SET.has(n.name) && (
              <label>
                Oscillator
                <select aria-label="Divergence source" value={n.source || "rsi"} onChange={(e) => update("source", e.target.value)}>
                  <option value="rsi">RSI 14</option>
                  <option value="macdHist">MACD histogram</option>
                </select>
              </label>
            )}
            {DISPLACEMENT_SET.has(n.name) && (
              <label>
                Body · ATR multiple
                <input type="number" min="0.5" max="5" step="0.1" value={n.mult ?? 1.5} onChange={(e) => update("mult", Number(e.target.value))} />
              </label>
            )}
            {SWING_PATTERN_SET.has(n.name) && (
              <label>
                Swing strength · bars each side
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={n.period || 5}
                  onChange={(e) => update("period", Number(e.target.value))}
                />
              </label>
            )}
          </>
        )}
        {n.op === "formula" && (
          <label>
            Formula · a and b are the two values, plus open, high, low, close, volume
            <input type="text" maxLength={200} value={n.expr} onChange={(e) => update("expr", e.target.value)} placeholder="a/b > 1.02" spellCheck={false} />
          </label>
        )}
        {[
          ["bars", n.op === "consecutive" ? "Closed bars in a row" : "Bars"],
          ["within", "Within · bars"],
          ["startHour", "Start hour · UTC"],
          ["endHour", "End hour · UTC"],
        ]
          .filter(([k]) => k in n)
          .map(([k, text]) => (
            <label key={k}>
              {text}
              <input
                type="number"
                value={n[k]}
                onChange={(e) => update(k, Number(e.target.value))}
              />
            </label>
          ))}
        {n.children && (
          <>
            <button
              type="button"
              className="secondary"
              disabled={n.children.length >= 8}
              onClick={() => update("children", [...n.children, leaf()])}
            >
              Add condition +
            </button>
            {n.children.map((c, i) => (
              <div className="child-rule" key={c.id}>
                <button type="button" onClick={() => setSelected(c.id)}>
                  {i + 1}. {label(c)}
                </button>
                <button
                  type="button"
                  aria-label="Remove condition"
                  disabled={n.children.length <= 1}
                  onClick={() =>
                    update(
                      "children",
                      n.children.filter((x) => x.id !== c.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      <details className="rule-library">
        <summary>
          <span className="overline">THE LIBRARY</span>
          <strong>Every value and pattern these rules can use</strong>
          <span aria-hidden="true">+</span>
        </summary>
        <div className="rule-library-grid">
          {GROUPS.map((g) => (
            <section key={g.name}>
              <h4>{g.name}</h4>
              {g.kinds.map(([k, name, help, params = []]) => (
                <p key={k}>
                  <b>{name}</b>
                  {params.length > 0 && <i>{params.map((x) => PARAM_LABELS[x].toLowerCase()).join(" · ")}</i>}
                  <span>{help}</span>
                </p>
              ))}
            </section>
          ))}
          {PATTERN_GROUPS.map(([group, names]) => (
            <section key={group}>
              <h4>{group === "Smart money" ? "Smart money events" : group === "Candles" ? "Candle patterns" : group}</h4>
              {names.map((k) => {
                const [, name, help] = PATTERNS.find(([x]) => x === k);
                return (
                  <p key={k}>
                    <b>{name}</b>
                    <span>{help}</span>
                  </p>
                );
              })}
            </section>
          ))}
          <section>
            <h4>Modifiers</h4>
            {MOD_FUNCTIONS.map(([k, name, help]) => (
              <p key={k}>
                <b>{name}</b>
                <span>{help}</span>
              </p>
            ))}
          </section>
          <section>
            <h4>Logic</h4>
            {[
              ["Compare", "above · at least · below · at most · crosses above · crosses below"],
              ["Formula", "custom expression over a and b plus open/high/low/close/volume, e.g. a/b > 1.5"],
              ["Trend", "a value rising or falling for N bars in a row"],
              ["Groups", "all conditions · any condition · invert"],
              ["Time", "consecutive closes · ordered sequence within N bars · UTC trading hours"],
              ["Context", "every value can read another market (BTC, ETH, SOL) or timeframe (1m–1h)"],
            ].map(([name, help]) => (
              <p key={name}>
                <b>{name}</b>
                <span>{help}</span>
              </p>
            ))}
          </section>
        </div>
        <p className="micro-note">
          Decisions use closed candles only. RSI, ATR and ADX use Wilder smoothing; EMA is seeded by the first-period mean; Bollinger bands use population deviation. Smart-money events follow LuxAlgo-style definitions on confirmed swings. Daily and weekly levels need a 15m or 1h context. Not supported: shorting, leverage, news or on-chain data, arbitrary code.
        </p>
      </details>
      <div className="flow-risk">
        <h3>Boundaries of the mission.</h3>
        {[
          ["maxEntries", "Maximum entries per position", 1, 5, 1],
          ["exitPercent", "Exit signal · position %", 1, 100, 1],
          ["trailingPct", "Trailing stop · % (0 off)", 0, 20, 0.1],
          ["cooldownBars", "Cooldown · closed bars", 0, 100, 1],
          ["dailyLossPct", "Daily equity loss cap · %", 0.1, 50, 0.1],
        ].map(([k, title, min, max, step]) => (
          <label key={k}>
            {title}
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={
                flow.risk?.[k] ??
                {
                  maxEntries: 1,
                  exitPercent: 100,
                  trailingPct: 0,
                  cooldownBars: 0,
                  dailyLossPct: 5,
                }[k]
              }
              onChange={(e) =>
                onChange({
                  ...flow,
                  risk: { ...flow.risk, [k]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
export function FlowGraph(props) { return <MissionCanvas {...props}/>; }
export function replayTrades(replay) {
  // Pair fills into round trips: buys accumulate a position, sells close part or all of it.
  const trades = [];
  let open = null;
  for (const e of replay.events || []) {
    const f = e.fill;
    if (!f) continue;
    const price = f.price / 100,
      qty = f.quantity / 1e6,
      fee = f.fee / 1e8;
    if (f.side === "BUY") {
      if (!open) open = { entryTime: f.created_at, entries: 0, cost: 0, qty: 0, fees: 0, reason: e.message };
      open.entries += 1;
      open.cost += qty * price;
      open.qty += qty;
      open.fees += fee;
    } else if (open) {
      const avg = open.cost / open.qty;
      const sold = Math.min(qty, open.qty);
      const pnl = (price - avg) * sold - fee - open.fees * (sold / open.qty);
      trades.push({
        entryTime: open.entryTime,
        exitTime: f.created_at,
        entryPrice: avg,
        exitPrice: price,
        pnlPct: ((price * sold - fee) / (avg * sold + open.fees * (sold / open.qty)) - 1) * 100,
        pnl,
        reason: e.message,
        entries: open.entries,
        partial: sold < open.qty - 1e-9,
      });
      open.fees -= open.fees * (sold / open.qty);
      open.cost -= avg * sold;
      open.qty -= sold;
      if (open.qty <= 1e-9) open = null;
    }
  }
  return { trades, open };
}
export function ReplayVerdict({ replay, mission }) {
  const { trades, open } = replayTrades(replay);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.length - wins;
  const minutes = { "1m": 1, "5m": 5, "15m": 15, "1h": 60 }[mission.plan.timeframe] || 1;
  const span = replay.bars * minutes;
  const window = span >= 1440 ? (span / 1440).toFixed(1) + " days" : span >= 60 ? Math.round(span / 60) + " hours" : span + " minutes";
  const asset = mission.plan.symbol.replace("USDT", "");
  const diff = replay.returnPct - replay.benchmarkReturnPct;
  const avg = trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;
  const small = trades.length < 10 || span < 1440;
  const inMarket = (replay.events || []).filter((e) => e.trace && Object.keys(e.trace).length && e.action !== "WAIT").length;
  return (
    <div className="replay-verdict">
      <span className="overline">WHAT HAPPENED</span>
      <p>
        Over the last <b>{window}</b> ({replay.bars} closed {mission.plan.timeframe} candles), the rules opened{" "}
        <b>{trades.length + (open ? 1 : 0)} position{trades.length + (open ? 1 : 0) === 1 ? "" : "s"}</b>
        {trades.length ? (
          <>
            : <b className="up">{wins} won</b>, <b className="down">{losses} lost</b>, average {avg >= 0 ? "+" : ""}{fmt(avg)}% per closed trade
          </>
        ) : open ? " and it is still open at the end of the window" : ", so nothing was bought or sold"}
        .
      </p>
      <p>
        {trades.length + (open ? 1 : 0) === 0
          ? `Starting with $10,000 you would still have $10,000. Simply holding ${asset} would have ${replay.benchmarkReturnPct >= 0 ? "gained" : "lost"} ${fmt(Math.abs(replay.benchmarkReturnPct))}%.`
          : `Starting with $10,000 you would end with $${fmt(10000 * (1 + replay.returnPct / 100))} (${replay.returnPct >= 0 ? "+" : ""}${fmt(replay.returnPct)}%). Simply holding ${asset} the whole time would have ${replay.benchmarkReturnPct >= 0 ? "gained" : "lost"} ${fmt(Math.abs(replay.benchmarkReturnPct))}%, so the rules did ${Math.abs(diff) < 0.005 ? "about the same" : diff > 0 ? `better by ${fmt(diff)} points` : `worse by ${fmt(-diff)} points`}${trades.length === 0 && open ? " so far" : ""}.`}
      </p>
      {small && (
        <p className="replay-warning">
          Too small a sample to judge: {trades.length} closed trade{trades.length === 1 ? "" : "s"} over {window}. This replay shows <em>how the rules behave</em> on recent candles, not whether they make money.
        </p>
      )}
    </div>
  );
}
export function TradeList({ replay }) {
  const { trades, open } = replayTrades(replay);
  if (!trades.length && !open) return null;
  return (
    <div className="replay-trades">
      <span className="overline">EVERY ROUND TRIP</span>
      <table>
        <thead>
          <tr>
            <th>Entered</th>
            <th>Exited</th>
            <th>Entry → exit</th>
            <th>Result</th>
            <th>Why it closed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={i}>
              <td>{new Date(t.entryTime).toLocaleString()}{t.entries > 1 ? ` (${t.entries} entries)` : ""}</td>
              <td>{new Date(t.exitTime).toLocaleString()}</td>
              <td>${fmt(t.entryPrice)} → ${fmt(t.exitPrice)}</td>
              <td className={t.pnl >= 0 ? "up" : "down"}>{t.pnlPct >= 0 ? "+" : ""}{fmt(t.pnlPct)}% · {t.pnl >= 0 ? "+" : "−"}${fmt(Math.abs(t.pnl))}{t.partial ? " · partial" : ""}</td>
              <td>{t.reason}</td>
            </tr>
          ))}
          {open && (
            <tr>
              <td>{new Date(open.entryTime).toLocaleString()}</td>
              <td>still open</td>
              <td>${fmt(open.cost / open.qty)} → marked at close</td>
              <td>—</td>
              <td>Position open at the end of the window</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Studio({ mission, onEdit }) {
  const planKey = useMemo(() => JSON.stringify(mission.plan), [mission.plan]);
  const [selected, setSelected] = useViewState(
      `studio.${mission.id}.selected`,
      null,
    ),
    [step, setStep] = useViewState(`studio.${mission.id}.step`, 0),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [slip, setSlip] = useViewState(`studio.${mission.id}.slippage`, 5),
    [scanCell, setScanCell] = useViewState(
      `studio.${mission.id}.scan-cell`,
      null,
    ),
    [scanning, setScanning] = useState(false),
    [mode, setMode] = useViewState(`studio.${mission.id}.mode`, "live");
  const queryClient = useQueryClient();
  const replayKey = dataKeys.replay(mission.id, planKey, Number(slip));
  const scanKey = dataKeys.scan(mission.id, planKey);
  const { data: replay = null } = useQuery({
    queryKey: replayKey,
    queryFn: () => Promise.resolve(null),
    enabled: false,
  });
  const { data: scan = null } = useQuery({
    queryKey: scanKey,
    queryFn: () => Promise.resolve(null),
    enabled: false,
  });
  useEffect(() => {
    if (!playing || !replay) return;
    const t = setInterval(
      () =>
        setStep((s) => {
          if (s >= replay.events.length - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      450,
    );
    return () => clearInterval(t);
  }, [playing, replay]);
  const event = mission.events?.find((e) => {
    try {
      const x = JSON.parse(e.evidence);
      return x.trace || x.signal?.trace;
    } catch {
      return false;
    }
  });
  let evidence = {};
  try {
    const x = JSON.parse(event?.evidence || "{}");
    evidence = x.signal || x;
  } catch {}
  const current = mode === "replay" ? replay?.events[step] : null;
  const cell = mode === "scan" && scan && scanCell ? scan.cells.find((c) => c.symbol + ":" + c.timeframe === scanCell) : null;
  const trace = current?.trace || cell?.trace || (mode === "live" ? evidence.trace || {} : {});
  const n = selected ? find(mission.plan.flow, selected) : null;
  async function runScan() {
    setScanning(true);
    setError("");
    try {
      const d = await api(`missions/${mission.id}/scan`, {});
      queryClient.setQueryData(scanKey, d);
      const first = d.cells.find((c) => c.entry === "pass") || d.cells[0];
      if (first) setScanCell(first.symbol + ":" + first.timeframe);
      setMode("scan");
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    try {
      const d = await api(`missions/${mission.id}/replay`, {
        slippageBps: Number(slip),
      });
      queryClient.setQueryData(replayKey, d);
      setStep(0);
      setMode("replay");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(mission.plan, null, 2)], {
        type: "application/json",
      }),
    );
    a.href = url;
    a.download = "algoty-mission.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="studio">
      <div className="studio-head">
        <div>
          <span className="overline">THE LOGIC, LAID OPEN</span>
          <h2>
            See what makes it move<span>.</span>
          </h2>
          <p>Inspect the rules. Follow the evidence. Change the next move.</p>
        </div>
        <div>
          <button className="secondary" onClick={download}>
            Export ↗
          </button>
          <button className="primary" onClick={onEdit}>
            Edit flow ↗
          </button>
        </div>
      </div>
      <div className="studio-toolbar">
        <div>
          <button
            className={mode === "live" ? "active" : ""}
            onClick={() => {
              setMode("live");
              setPlaying(false);
            }}
          >
            Live observations
          </button>
          <button
            disabled={!replay}
            className={mode === "replay" ? "active" : ""}
            onClick={() => setMode("replay")}
          >
            Historical replay
          </button>
        </div>
        <span className="flow-legend">
          <i /> Met <i /> Unmet <i /> Awaiting data
        </span>
      </div>
      <div className="studio-body">
        <FlowGraph
          flow={mission.plan.flow}
          trace={trace}
          selected={selected}
          onSelect={setSelected}
        />
        <aside className="trace-panel">
          <span className="overline">
            {mode === "live" ? "LATEST OBSERVATION" : mode === "scan" ? "SCAN · " + (scanCell || "").replace("USDT", "").replace(":", " · ") : "REPLAY OBSERVATION"}
          </span>
          <h3>{n ? label(n) : "Every condition has a reason."}</h3>
          {n ? (
            <>
              <span
                className={"trace-status " + (trace[n.id]?.status || "idle")}
              >
                {trace[n.id]?.status || "Not evaluated yet"}
              </span>
              <dl>
                {Object.entries(trace[n.id] || {})
                  .filter(([k]) => k !== "status")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>
                        {typeof v === "number" ? fmt(v, 4) : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : (
            <p>Select a rule to see the values that passed or held it back.</p>
          )}
          <small>
            {current
              ? new Date(current.time).toLocaleString()
              : cell
                ? new Date(cell.barTime).toLocaleString() + " · close $" + fmt(cell.close)
                : event
                  ? new Date(event.created_at).toLocaleString()
                  : "No evaluated candle yet"}
          </small>
          <p>
            {current?.message ||
              event?.message ||
              "Your draft remains inactive until you activate it."}
          </p>
          {current?.fill && (
            <div className="flow-receipt">
              <b>{current.fill.side} · historical fill</b>
              <p>
                {fmt(current.fill.quantity / 1e6, 6)} at $
                {fmt(current.fill.price / 100)}
              </p>
              <small>Fee ${fmt(current.fill.fee / 1e8, 4)}</small>
            </div>
          )}
          {mode === "live" && event?.kind === "ORDER" && (
            <div className="flow-receipt">
              <b>Execution receipt</b>
              {mission.portfolio.fills
                .filter((f) => f.order_id === JSON.parse(event.evidence).order)
                .map((f) => (
                  <p key={f.id}>
                    {f.side} {fmt(f.quantity / 1e6, 6)} at ${fmt(f.price / 100)}{" "}
                    · fee ${fmt(f.fee / 1e8, 4)}
                  </p>
                ))}
            </div>
          )}
        </aside>
      </div>
      <div className="execution-rails">
        <div>
          <span className="overline">01 / ALLOCATE</span>
          <strong>${fmt(mission.plan.orderQuote)} per entry</strong>
          <small>
            Up to {mission.plan.flow.risk?.maxEntries ?? 1} entries · $
            {fmt(mission.plan.maxPositionQuote)} position cap
          </small>
        </div>
        <div>
          <span className="overline">02 / PROTECT</span>
          <strong>
            {mission.plan.stopLossPct}% stop ·{" "}
            {mission.plan.takeProfitPct
              ? mission.plan.takeProfitPct + "% target"
              : "flow-based target"}
          </strong>
          <small>
            Trailing {mission.plan.flow.risk?.trailingPct || 0}% · closed-candle
            checks · protective exits close 100%
          </small>
        </div>
        <div>
          <span className="overline">03 / EXECUTE</span>
          <strong>
            {mission.plan.flow.risk?.exitPercent ?? 100}% on an exit signal
          </strong>
          <small>
            {mission.plan.dailyTrades} daily entries ·{" "}
            {mission.plan.flow.risk?.dailyLossPct ?? 5}% daily loss cap ·{" "}
            {mission.plan.flow.risk?.cooldownBars ?? 0} bar cooldown
          </small>
        </div>
      </div>
      <div className="scan-desk">
        <div>
          <span className="overline">EVERY MARKET, RIGHT NOW</span>
          <h3>Where do these rules hold?</h3>
          <p>
            The same entry and exit rules checked on the latest closed candle of every market and timeframe. Pick a cell to see its evidence.
          </p>
        </div>
        <button className="secondary" disabled={scanning} onClick={runScan}>
          {scanning ? "Reading twelve markets…" : scan ? "Scan again" : "Scan all markets"} ↗
        </button>
        {scan && (
          <div className="scan-grid" role="grid" aria-label="Rule status by market and timeframe">
            <div className="scan-row scan-head" role="row">
              <span />
              {["1m", "5m", "15m", "1h"].map((tf) => (
                <span key={tf} role="columnheader">{tf}</span>
              ))}
            </div>
            {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((symbol) => (
              <div className="scan-row" role="row" key={symbol}>
                <span role="rowheader">{symbol.replace("USDT", "")}</span>
                {["1m", "5m", "15m", "1h"].map((tf) => {
                  const c = scan.cells.find((x) => x.symbol === symbol && x.timeframe === tf) || {};
                  const key = symbol + ":" + tf;
                  return (
                    <button
                      key={tf}
                      role="gridcell"
                      type="button"
                      className={"scan-cell " + (c.entry || "error") + (scanCell === key && mode === "scan" ? " chosen" : "")}
                      title={c.error || `Entry ${c.entry} · exit ${c.exit}`}
                      onClick={() => {
                        setScanCell(key);
                        setMode("scan");
                      }}
                    >
                      <b>{c.entry === "pass" ? "Entry ✓" : c.entry === "fail" ? "Entry −" : c.entry === "waiting" ? "Waiting" : "Error"}</b>
                      <small>{c.exit === "pass" ? "exit ✓" : c.exit === "fail" ? "exit −" : c.exit === "waiting" ? "exit ○" : ""}</small>
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="micro-note">
              Scanned {new Date(scan.scannedAt).toLocaleTimeString()}. A cell turns green only when every entry condition is true on that market's last closed candle. Alerts: set the mission to <b>watch only</b> in the plan editor and activate it; each new signal is journaled and emailed.
            </p>
          </div>
        )}
      </div>
      <div className="replay-desk">
        <div>
          <span className="overline">BEFORE THE NEXT MOVE</span>
          <h3>Give the rules a past.</h3>
          <p>
            Replay recent closed candles with the same rule engine. Orders fill
            at the next open, with costs.
          </p>
        </div>
        <label>
          Slippage · basis points
          <input
            type="number"
            value={slip}
            min="0"
            max="100"
            onChange={(e) => setSlip(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy} onClick={test}>
          {busy ? "Reading the market…" : "Run historical replay"} ↗
        </button>
      </div>
      {error && (
        <p role="alert" className="plan-question">
          {error}
        </p>
      )}
      {replay && (
        <div className="replay-result">
          <ReplayVerdict replay={replay} mission={mission} />
          <div className="stat-strip stat-strip-explained">
            {[
              ["Net return", fmt(replay.returnPct) + "%", "what $10,000 became after fees and slippage"],
              ["Buy & hold", fmt(replay.benchmarkReturnPct) + "%", "if you had simply bought at the start and held"],
              ["Max drawdown", fmt(replay.drawdownPct) + "%", "the worst dip from a peak along the way"],
              ["Fills / fees", replay.fills + " / $" + fmt(replay.fees), "orders executed and what they cost"],
            ].map(([k, v, help]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
                <span className="stat-help">{help}</span>
              </div>
            ))}
          </div>
          <Curve
            series={[replay.curve]}
            labels={["Rules"]}
            benchmark={replay.benchmarkCurve || null}
            markers={(replay.events || []).filter((e) => e.fill).map((e) => ({ created_at: e.fill.created_at, side: e.fill.side }))}
          />
          <TradeList replay={replay} />
          <div className="replay-scrub">
            <button
              className="secondary"
              onClick={() => {
                setMode("replay");
                if (step >= replay.events.length - 1) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play"} {playing ? "Ⅱ" : "▷"}
            </button>
            <input
              aria-label="Replay candle"
              type="range"
              min="0"
              max={replay.events.length - 1}
              value={step}
              onChange={(e) => {
                setPlaying(false);
                setMode("replay");
                setStep(Number(e.target.value));
              }}
            />
            <span>
              {step + 1} / {replay.bars}
            </span>
          </div>
          <p className="micro-note">
            Scrub through the candles above to see which rules passed or failed at each decision; the flow and the observation panel follow the slider.
            {" "}{replay.model} Dates: {new Date(replay.start).toLocaleString()} —{" "}
            {new Date(replay.end).toLocaleString()}.
          </p>
        </div>
      )}
    </section>
  );
}
