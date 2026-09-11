"use client";
import Link from 'next/link';
import { useEffect, useState } from "react";
import Studio, {
  FlowEditor,
  template,
  starter,
} from "../components/product/studio";
import {
  api,
  useUser,
  useModal,
  Shell,
  Notice,
  Curve,
  fmt,
  usd,
} from "../components/product/common";
const strategies = {
  CUSTOM: "Composable flow",
  BREAKOUT: "Range breakout",
  MA_CROSS: "Moving-average trend",
  RSI_REVERSION: "RSI mean reversion",
};
const fields = [
  ["lookback", "Range / volume lookback", 5, 50, 1],
  ["confirmationBars", "Confirming candles", 1, 3, 1],
  ["fast", "Fast average", 2, 20, 1],
  ["slow", "Slow average", 5, 50, 1],
  ["volumeRatio", "Minimum volume ratio", 0, 5, 0.1],
  ["orderQuote", "Entry allocation · USDT", 10, 2000, 10],
  ["maxPositionQuote", "Position budget · USDT", 10, 10000, 10],
  ["dailyTrades", "Daily entry cap · UTC", 1, 20, 1],
  ["stopLossPct", "Stop loss · %", 0.1, 20, 0.1],
  ["takeProfitPct", "Take profit · %", 0.1, 50, 0.1],
  ["durationHours", "Mission duration · hours", 1, 168, 1],
];
function Stats({ m }) {
  const eq = m.portfolio?.equity ?? m.curve?.at(-1)?.equity ?? 1e12;
  let peak = 1e12,
    dd = 0;
  for (const p of m.curve || []) {
    peak = Math.max(peak, p.equity);
    dd = Math.max(dd, ((peak - p.equity) / peak) * 100);
  }
  return (
    <div className="stat-strip">
      <div>
        <small>Virtual equity</small>
        <strong>{usd(eq)}</strong>
      </div>
      <div>
        <small>Net return</small>
        <strong className={eq >= 1e12 ? "up" : "down"}>
          {fmt((eq / 1e12 - 1) * 100)}%
        </strong>
      </div>
      <div>
        <small>Observed drawdown</small>
        <strong>{fmt(dd)}%</strong>
      </div>
      <div>
        <small>Execution fees</small>
        <strong>
          {usd(
            m.portfolio?.fees ?? (m.fills || []).reduce((s, f) => s + f.fee, 0),
          )}
        </strong>
      </div>
    </div>
  );
}
function PlanEditor({ plan, onSave, busy }) {
  const [p, setP] = useState({ ...plan });
  function set(k, v) {
    setP((s) => ({ ...s, [k]: v }));
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <div className="plan-fields">
        <label className="full">
          Mission name
          <input
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength="80"
            required
          />
        </label>
        <label>
          Market
          <select
            value={p.symbol}
            onChange={(e) => set("symbol", e.target.value)}
          >
            {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Timeframe
          <select
            value={p.timeframe}
            onChange={(e) => set("timeframe", e.target.value)}
          >
            <option>1m</option>
            <option>5m</option>
            {p.strategy === "CUSTOM" && (
              <>
                <option>15m</option>
                <option>1h</option>
              </>
            )}
          </select>
        </label>
        <label className="full">
          Entry / exit rule
          <select
            value={p.strategy}
            onChange={(e) =>
              setP((old) => {
                const next = {
                  ...old,
                  strategy: e.target.value,
                  timeframe: "1m",
                };
                if (e.target.value === "CUSTOM") next.flow = template();
                else delete next.flow;
                return next;
              })
            }
          >
            {Object.entries(strategies).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {fields
          .filter(
            ([k]) =>
              p.strategy !== "CUSTOM" ||
              ![
                "lookback",
                "fast",
                "slow",
                "volumeRatio",
                "confirmationBars",
              ].includes(k),
          )
          .map(([k, label, min, max, step]) => (
            <label key={k}>
              {label}
              <input
                type="number"
                value={p[k]}
                min={k === "takeProfitPct" && p.strategy === "CUSTOM" ? 0 : min}
                max={max}
                step={step}
                required
                onChange={(e) => set(k, Number(e.target.value))}
              />
            </label>
          ))}
      </div>
      {p.strategy === "CUSTOM" && (
        <FlowEditor flow={p.flow} onChange={(v) => set("flow", v)} />
      )}
      {p.questions?.length > 0 && (
        <div className="plan-question">
          <strong>Before this can run</strong>
          <ul>
            {p.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              style={{ display: "inline", width: "auto", marginRight: 8 }}
              onChange={(e) => {
                if (e.target.checked) set("questions", []);
              }}
            />
            I reviewed the limits and accept this supported plan without those
            features.
          </label>
        </div>
      )}
      <p className="plan-note">
        Spot trading with reviewed rules. Composable flows execute
        deterministically; legacy entries also use an AI evidence review. Exits
        use the selected rule and stop/target checks at candle close; these are
        not intrabar stop orders. No short selling or leverage.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save reviewed plan"} ↗
      </button>
    </form>
  );
}
export default function Agents() {
  const { user, error } = useUser();
  const [list, setList] = useState([]),
    [selected, setSelected] = useState(null),
    [m, setM] = useState(null),
    [brief, setBrief] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(false),
    [instruction, setInstruction] = useState(""),
    [preview, setPreview] = useState(null),
    [branch, setBranch] = useState(false),
    [variation, setVariation] = useState(
      "Wait for two confirming candles before entering; keep the same market and allocation.",
    ),
    [comparison, setComparison] = useState(null),
    [share, setShare] = useState("");
  useModal(!!(editor || branch || preview), () => {
    setEditor(false);
    setBranch(false);
    setPreview(null);
  });
  async function refresh() {
    const rows = await api("missions");
    setList(rows);
    if (selected) setM(await api("missions/" + selected));
    if (comparison) {
      const members = rows.filter((x) => x.group_id === comparison.group);
      setComparison({
        group: comparison.group,
        agents: await Promise.all(members.map((x) => api("missions/" + x.id))),
      });
    }
  }
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      refresh().catch((e) => {
        if (alive) setNotice(e.message);
      });
    load();
    const t = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, selected, comparison?.group]);
  useEffect(() => {
    if (!editor && !branch && !preview) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        setEditor(false);
        setBranch(false);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, branch, preview]);
  async function run(fn) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(id) {
    setComparison(null);
    setShare("");
    setSelected(id);
    setM(null);
    if (id)
      try {
        setM(await api("missions/" + id));
      } catch (e) {
        setNotice(e.message);
      }
  }
  async function draft(e) {
    e.preventDefault();
    run(async () => {
      const d = await api("missions", { brief });
      setSelected(d.id);
      setM(d);
      setList(await api("missions"));
      setEditor(true);
      setNotice("Your AI plan is ready for review. It is not trading yet.");
    });
  }
  async function control(action) {
    run(async () => {
      setM(await api("missions/" + m.id + "/control", { action }));
      setList(await api("missions"));
    });
  }
  async function savePlan(p) {
    run(async () => {
      const d = await api("missions/" + m.id + "/edit", p);
      setM(d);
      setSelected(d.id);
      setEditor(false);
      setPreview(null);
      setList(await api("missions"));
      setNotice("Plan saved. Activate when you are ready.");
    });
  }
  async function loadComparison(group) {
    setSelected(null);
    setM(null);
    setShare("");
    run(async () => {
      const rows = list.filter((x) => x.group_id === group);
      setComparison({
        group,
        agents: await Promise.all(rows.map((x) => api("missions/" + x.id))),
      });
    });
  }
  const groups = [...new Set(list.map((x) => x.group_id).filter(Boolean))];
  return (
    <Shell active="agents" user={user}>
      <div className="workspace-heading">
        <div>
          <span className="overline">MISSION CONTROL</span>
          <h1>
            Your idea. Its next move<span>.</span>
          </h1>
        </div>
        <div className="workspace-summary">
          <span>
            Live missions
            <b>{list.filter((x) => x.status === "ACTIVE").length} / 4</b>
          </span>
          <span>
            Your agents<b>{list.length}</b>
          </span>
          <Link href="/trade">Back to exchange ↗</Link>
        </div>
      </div>
      <Notice text={notice || error} clear={() => setNotice("")} />
      <div className="mission-layout">
        <aside className="mission-sidebar">
          <button
            className="primary new-mission"
            onClick={() => {
              choose(null);
              setBrief("");
            }}
          >
            New mission <span>+</span>
          </button>
          {list.map((x) => (
            <button
              key={x.id}
              className={
                "mission-list-item " + (selected === x.id ? "chosen" : "")
              }
              onClick={() => choose(x.id)}
            >
              <div>
                <span className={"order-status " + x.status}>{x.status}</span>
                <span>
                  V{x.version} · {x.plan.symbol.replace("USDT", "")}
                </span>
              </div>
              <strong>{x.plan.name}</strong>
              <b>{x.equity == null ? "—" : usd(x.equity)}</b>
              <div>
                <span>{strategies[x.plan.strategy]}</span>
                <span>{x.plan.timeframe}</span>
              </div>
            </button>
          ))}
          {groups.length > 0 && (
            <div className="compare-picker">
              {groups.map((g, i) => (
                <button key={g} onClick={() => loadComparison(g)}>
                  Comparison {groups.length - i} · two agents ↗
                </button>
              ))}
            </div>
          )}
        </aside>
        <div className="mission-canvas">
          {!selected && !comparison && (
            <>
              <section className="composer">
                <span className="overline">IDEAS INTO ACTION</span>
                <span className="composer-star">✳</span>
                <h2>
                  What would you
                  <br />
                  like the market to show you?
                </h2>
                <p>
                  Give your agent a brief. Review its rules, set the boundaries,
                  then follow every decision as the market moves.
                </p>
                <form onSubmit={draft}>
                  <textarea
                    aria-label="Mission brief"
                    placeholder="Watch Bitcoin for a breakout. Use $300 per entry, wait for higher volume, and run for 24 hours…"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    minLength="12"
                    maxLength="2500"
                    required
                  />
                  <div className="prompt-examples">
                    {[
                      "Watch BTC for a breakout on 1-minute candles. Use $300 per entry, a 2% stop and 4% target for 24 hours.",
                      "Follow ETH with a moving-average trend plan. Use $200 per entry and a 2% stop for 12 hours.",
                      "Watch SOL for RSI mean reversion on 5-minute candles with $150 entries, 2% stop and 3% target.",
                    ].map((s, i) => (
                      <button type="button" key={s} onClick={() => setBrief(s)}>
                        {
                          [
                            "Catch a breakout ↗",
                            "Follow the trend ↗",
                            "Watch for a reversal ↗",
                          ][i]
                        }
                      </button>
                    ))}
                  </div>
                  <div className="composer-foot">
                    <span>
                      Every agent starts with $10,000 virtual capital.
                    </span>
                    <button className="primary" disabled={busy || !user}>
                      {busy ? "Shaping your mission…" : "Build my mission"}{" "}
                      <span>↗</span>
                    </button>
                  </div>
                </form>
                <div className="studio-import">
                  {["trend", "breakout", "reversal"].map((kind) => (
                    <button
                      key={kind}
                      disabled={busy || !user}
                      onClick={() =>
                        run(async () => {
                          const d = await api("missions/manual", starter(kind));
                          setSelected(d.id);
                          setM(d);
                          setList(await api("missions"));
                          setEditor(true);
                        })
                      }
                    >
                      {kind[0].toUpperCase() + kind.slice(1)} flow +
                    </button>
                  ))}
                  <label>
                    Import definition ↗
                    <input
                      type="file"
                      accept=".json,application/json"
                      aria-label="Import mission definition"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        run(async () => {
                          if (f.size > 12000)
                            throw new Error("Definition is too large");
                          const d = await api(
                            "missions/manual",
                            JSON.parse(await f.text()),
                          );
                          setSelected(d.id);
                          setM(d);
                          setList(await api("missions"));
                          setEditor(true);
                        });
                      }}
                    />
                  </label>
                </div>
              </section>
              <div className="mission-principles">
                <div>
                  <span>01 /</span>
                  <h3>You set the brief.</h3>
                  <p>
                    AI turns your intent into specific, editable rules. Anything
                    unsupported is surfaced before activation.
                  </p>
                </div>
                <div>
                  <span>02 /</span>
                  <h3>Every move has evidence.</h3>
                  <p>
                    Follow market observations, decisions, actual paper fills
                    and costs in one timeline.
                  </p>
                </div>
                <div>
                  <span>03 /</span>
                  <h3>Explore a second path.</h3>
                  <p>
                    Branch an idea. Run two versions from equal capital and the
                    same start, then compare their results.
                  </p>
                </div>
              </div>
            </>
          )}
          {selected && !m && (
            <div className="chart-skeleton">Opening your mission…</div>
          )}
          {m && !comparison && (
            <>
              <div className="mission-title">
                <div>
                  <span className={"order-status " + m.status}>{m.status}</span>
                  <h2>{m.plan.name}</h2>
                  <p>
                    {m.plan.symbol} · {strategies[m.plan.strategy]} ·{" "}
                    {m.plan.timeframe} · Version {m.version}
                    {m.expires_at && (
                      <> · Ends {new Date(m.expires_at).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <div className="mission-actions">
                  {m.status === "DRAFT" && !m.group_id && (
                    <button
                      className="primary"
                      disabled={busy || m.plan.questions.length > 0}
                      onClick={() => control("activate")}
                    >
                      Activate mission ↗
                    </button>
                  )}
                  {m.status === "DRAFT" && m.group_id && (
                    <button
                      className="primary"
                      onClick={() => loadComparison(m.group_id)}
                    >
                      Review paired start ↗
                    </button>
                  )}
                  {m.status === "ACTIVE" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => control("pause")}
                    >
                      Pause
                    </button>
                  )}
                  {m.status === "PAUSED" && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => control("resume")}
                    >
                      Resume ↗
                    </button>
                  )}
                  {["ACTIVE", "PAUSED"].includes(m.status) && (
                    <button
                      className="secondary danger-link"
                      disabled={busy}
                      onClick={() => control("stop")}
                    >
                      Stop
                    </button>
                  )}
                  <button className="secondary" onClick={() => setEditor(true)}>
                    {m.status === "DRAFT" ? "Edit plan" : "New version"}
                  </button>
                </div>
              </div>
              {m.plan.questions.length > 0 && (
                <div className="plan-question">
                  {m.plan.questions.join(" ")}{" "}
                  <button onClick={() => setEditor(true)}>
                    Review plan ↗
                  </button>
                </div>
              )}
              {m.plan.strategy === "CUSTOM" && (
                <Studio key={m.id} mission={m} onEdit={() => setEditor(true)} />
              )}
              <Stats m={m} />
              <section className="mission-chart">
                <div className="panel-heading">
                  <span>THE PATH SO FAR</span>
                  <span>Virtual equity · 15-second observations</span>
                </div>
                <Curve series={[m.curve]} labels={[m.plan.name]} />
              </section>
              <div className="mission-two">
                <section className="mission-block">
                  <h3>The mission plan.</h3>
                  <div className="plan-summary">
                    {[
                      ["Entry allocation", "$" + fmt(m.plan.orderQuote)],
                      ["Position budget", "$" + fmt(m.plan.maxPositionQuote)],
                      [
                        "Stop / target",
                        `${m.plan.stopLossPct}% / ${m.plan.takeProfitPct}%`,
                      ],
                      ["Daily entry cap", m.plan.dailyTrades],
                      [
                        m.plan.strategy === "CUSTOM"
                          ? "Decision clock"
                          : "Confirmation",
                        m.plan.strategy === "CUSTOM"
                          ? m.plan.timeframe + " closed bars"
                          : m.plan.confirmationBars + " closed bars",
                      ],
                      ["Duration", m.plan.durationHours + " hours"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        {v}
                      </div>
                    ))}
                  </div>
                  <p className="micro-note">
                    Stops are evaluated on candle close. Pausing or stopping
                    cancels pending orders; existing holdings remain exposed to
                    market prices.
                  </p>
                  <h3>Give it a new instruction.</h3>
                  <form
                    className="instruction-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () =>
                        setPreview(
                          await api("missions/" + m.id + "/instruction", {
                            instruction,
                          }),
                        ),
                      );
                    }}
                  >
                    <input
                      aria-label="Agent instruction"
                      placeholder="Reduce each entry to $100…"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      minLength="3"
                      maxLength="1000"
                      required
                    />
                    <button className="secondary" disabled={busy}>
                      Preview ↗
                    </button>
                  </form>
                  <p className="micro-note">
                    Instructions are proposals until you confirm them. Rule
                    changes create a new draft after activation.
                  </p>
                  <button className="secondary" onClick={() => setBranch(true)}>
                    Explore a second path ↗
                  </button>
                </section>
                <section className="mission-block">
                  <h3>Decision journal.</h3>
                  <div className="activity-feed">
                    {m.events.map((e) => (
                      <div className="activity-item" key={e.id}>
                        <small>
                          {e.kind} ·{" "}
                          {new Date(e.created_at).toLocaleTimeString()}
                        </small>
                        <p>{e.message}</p>
                        {e.evidence !== "{}" && (
                          <details>
                            <summary>See evidence</summary>
                            <pre>
                              {JSON.stringify(JSON.parse(e.evidence), null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="portfolio-section">
                <div className="panel-heading">
                  MISSION EXECUTIONS{" "}
                  <span>{m.portfolio.fills.length} recent fills</span>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {["Time", "Side", "Price", "Quantity", "Fee"].map(
                          (v) => (
                            <th key={v}>{v}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {m.portfolio.fills.map((f) => (
                        <tr key={f.id}>
                          <td>{new Date(f.created_at).toLocaleString()}</td>
                          <td className={f.side === "BUY" ? "up" : "down"}>
                            {f.side}
                          </td>
                          <td>{fmt(f.price / 100)}</td>
                          <td>{fmt(f.quantity / 1e6, 6)}</td>
                          <td>{usd(f.fee)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!m.portfolio.fills.length && (
                    <div className="empty-state">
                      <h3>No trades rushed.</h3>
                      <p>
                        {m.status === "DRAFT"
                          ? "Activate your reviewed plan to start watching the market."
                          : "The agent waits for its entry conditions. Watch the journal for its observations."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          {comparison && (
            <>
              <div className="mission-title">
                <div>
                  <span className="overline">TWO PATHS. ONE START.</span>
                  <h2>A fairer comparison.</h2>
                  <p>
                    Two separate $10,000 virtual accounts. New decisions from
                    the same start.
                  </p>
                </div>
                <div className="mission-actions">
                  {comparison.agents.every((x) => x.status === "DRAFT") && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api(
                            "comparisons/" + comparison.group + "/start",
                            {},
                          );
                          await refresh();
                          setNotice("Both agents started together.");
                        })
                      }
                    >
                      Start both agents ↗
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const d = await api(
                          "comparisons/" + comparison.group + "/share",
                          {},
                        );
                        setShare(location.origin + "/shared/" + d.token);
                      })
                    }
                  >
                    Publish comparison ↗
                  </button>
                </div>
              </div>
              {share && (
                <div className="share-path">
                  Read-only link · Anyone with this link can see these two
                  plans, curves and fills.
                  <br />
                  <a href={share} target="_blank" rel="noreferrer">
                    {share}
                  </a>
                  <button
                    className="secondary"
                    onClick={() => navigator.clipboard.writeText(share)}
                  >
                    Copy link
                  </button>
                </div>
              )}
              <div className="mission-chart">
                <div className="panel-heading">
                  VIRTUAL EQUITY{" "}
                  <span>Observed performance, not a forecast</span>
                </div>
                <Curve
                  series={comparison.agents.map((x) => x.curve)}
                  labels={comparison.agents.map((x) => x.plan.name)}
                />
              </div>
              <div className="mission-two">
                {comparison.agents.map((x, i) => (
                  <section key={x.id} className="mission-block">
                    <span className="overline">
                      PATH {i ? "B" : "A"} · {x.status}
                    </span>
                    <h3>{x.plan.name}</h3>
                    <Stats m={x} />
                    <p className="compare-caption">
                      {strategies[x.plan.strategy]} · {x.plan.timeframe}
                      <br />${x.plan.orderQuote} per entry ·{" "}
                      {x.plan.confirmationBars} confirming candles
                      <br />
                      {x.plan.stopLossPct}% stop / {x.plan.takeProfitPct}%
                      target
                      <br />
                      {x.portfolio.fills.length} recent fills ·{" "}
                      {x.plan.durationHours} hours
                    </p>
                    {x.plan.questions.length > 0 && (
                      <p className="plan-question">
                        {x.plan.questions.join(" ")}
                      </p>
                    )}
                    <button className="secondary" onClick={() => choose(x.id)}>
                      Inspect / edit agent ↗
                    </button>
                  </section>
                ))}
              </div>
              <p className="compare-caption">
                Both accounts use the same execution model and fees. Market
                paths are shared; liquidity consumption is modeled independently
                per account. Later pauses, edits or different durations can
                change the comparison. Drawdown uses sampled equity.
              </p>
            </>
          )}
        </div>
      </div>
      {(editor || branch || preview) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setEditor(false);
            setBranch(false);
            setPreview(null);
          }}
        >
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              editor
                ? "Review mission plan"
                : branch
                  ? "Create comparison"
                  : "Confirm instruction"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => {
                setEditor(false);
                setBranch(false);
                setPreview(null);
              }}
            >
              ×
            </button>
            <Notice text={notice} />
            {editor && (
              <>
                <span className="overline">YOUR RULES, IN WRITING</span>
                <h2>Review the plan.</h2>
                <PlanEditor
                  key={m.id}
                  plan={m.plan}
                  busy={busy}
                  onSave={savePlan}
                />
              </>
            )}
            {branch && (
              <>
                <span className="overline">EXPLORE AN ALTERNATIVE</span>
                <h2>What would you change?</h2>
                <p className="compare-caption">
                  We will create two fresh drafts: a copy of this plan and an
                  AI-proposed variation. Your current mission stays as it is.
                  Review both before starting together.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const d = await api("missions/" + m.id + "/branch", {
                        brief: variation,
                      });
                      setComparison(d);
                      setSelected(null);
                      setM(null);
                      setBranch(false);
                      setList(await api("missions"));
                    });
                  }}
                >
                  <textarea
                    aria-label="Comparison variation"
                    rows="5"
                    value={variation}
                    minLength="12"
                    maxLength="1500"
                    required
                    onChange={(e) => setVariation(e.target.value)}
                  />
                  <button
                    className="primary"
                    style={{ marginTop: 20 }}
                    disabled={busy}
                  >
                    {busy ? "Building both paths…" : "Prepare comparison"} ↗
                  </button>
                </form>
              </>
            )}
            {preview && (
              <>
                <span className="overline">INSTRUCTION PREVIEW</span>
                <h2>
                  {preview.action === "edit"
                    ? "A change of plan."
                    : "Here is the proposal."}
                </h2>
                <p className="compare-caption">{preview.message}</p>
                {preview.action === "edit" && preview.plan ? (
                  <PlanEditor
                    plan={preview.plan}
                    busy={busy}
                    onSave={savePlan}
                  />
                ) : preview.action === "clarify" ? (
                  <p className="plan-question">
                    Update your instruction with the information above.
                  </p>
                ) : (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      const a = preview.action;
                      setPreview(null);
                      control(a);
                    }}
                  >
                    Confirm {preview.action} ↗
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
