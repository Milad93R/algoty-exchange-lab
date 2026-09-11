"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import MissionCanvas from "./MissionCanvas";
import { api, Curve, fmt } from "./common";
const kinds = [
  "close",
  "open",
  "high",
  "low",
  "volume",
  "sma",
  "ema",
  "rsi",
  "atr",
  "highest",
  "lowest",
  "volumeRatio",
];
const ops = [
  "gt",
  "gte",
  "lt",
  "lte",
  "crossAbove",
  "crossBelow",
  "all",
  "any",
  "not",
  "consecutive",
  "sequence",
  "schedule",
];
const words = {
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
  crossAbove: "crosses above",
  crossBelow: "crosses below",
  all: "All conditions",
  any: "Any condition",
  not: "Invert condition",
  consecutive: "Consecutive closes",
  sequence: "In this order",
  schedule: "Trading hours · UTC",
};
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
function val(v) {
  return typeof v === "number"
    ? String(v)
    : `${v?.kind || "—"}${v?.period ? " " + v.period : ""}${v?.offset ? " · previous " + v.offset : ""}${v?.symbol ? " · " + v.symbol.replace("USDT", "") : ""}${v?.timeframe ? " / " + v.timeframe : ""}`;
}
function label(n) {
  return n.left !== undefined
    ? `${val(n.left)} ${words[n.op]} ${val(n.right)}`
    : `${words[n.op]}${n.bars ? " · " + n.bars : ""}${n.within ? " · " + n.within + " bars" : ""}${n.op === "schedule" ? " · " + n.startHour + "–" + n.endHour : ""}`;
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
function Operand({ value, onChange }) {
  const numeric = typeof value === "number";
  return (
    <div className="operand">
      <select
        aria-label="Value source"
        value={numeric ? "number" : value.kind}
        onChange={(e) =>
          onChange(
            e.target.value === "number"
              ? 0
              : { kind: e.target.value, period: 14 },
          )
        }
      >
        <option value="number">Fixed value</option>
        {kinds.map((k) => (
          <option key={k}>{k}</option>
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
          <label>
            Period
            <input
              type="number"
              min="2"
              max="200"
              value={value.period || 14}
              onChange={(e) =>
                onChange({ ...value, period: Number(e.target.value) })
              }
            />
          </label>
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
            <span className="overline">LEFT SIDE</span>
            <Operand value={n.left} onChange={(v) => update("left", v)} />
            <span className="overline">RIGHT SIDE</span>
            <Operand value={n.right} onChange={(v) => update("right", v)} />
          </>
        )}
        {["bars", "within", "startHour", "endHour"]
          .filter((k) => k in n)
          .map((k) => (
            <label key={k}>
              {k}
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
export default function Studio({ mission, onEdit }) {
  const [selected, setSelected] = useState(null),
    [replay, setReplay] = useState(null),
    [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [slip, setSlip] = useState(5),
    [mode, setMode] = useState("live");
  useEffect(() => {
    setReplay(null);
    setSelected(null);
    setMode("live");
  }, [mission.id, JSON.stringify(mission.plan)]);
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
  const trace = current?.trace || (mode === "live" ? evidence.trace || {} : {});
  const n = selected ? find(mission.plan.flow, selected) : null;
  async function test() {
    setBusy(true);
    setError("");
    try {
      const d = await api(`missions/${mission.id}/replay`, {
        slippageBps: Number(slip),
      });
      setReplay(d);
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
            {mode === "live" ? "LATEST OBSERVATION" : "REPLAY OBSERVATION"}
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
          <div className="stat-strip">
            {[
              ["Net return", fmt(replay.returnPct) + "%"],
              ["Buy & hold", fmt(replay.benchmarkReturnPct) + "%"],
              ["Drawdown", fmt(replay.drawdownPct) + "%"],
              ["Fills / fees", replay.fills + " / $" + fmt(replay.fees)],
            ].map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <Curve series={[replay.curve]} labels={["Historical equity"]} />
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
            {replay.model} Dates: {new Date(replay.start).toLocaleString()} —{" "}
            {new Date(replay.end).toLocaleString()}.
          </p>
        </div>
      )}
    </section>
  );
}
