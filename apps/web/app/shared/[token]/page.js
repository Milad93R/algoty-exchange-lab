"use client";
import { useEffect, useState, use } from "react";
import {
  api,
  Shell,
  Notice,
  Curve,
  fmt,
  usd,
} from "../../components/product/common";
export default function Shared({ params }) {
  const { token } = use(params);
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      api("shared/" + token)
        .then(setData)
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [token]);
  return (
    <Shell>
      <div className="shared-wrap">
        <div className="workspace-heading">
          <div>
            <span className="overline">A SHARED EXPERIMENT / READ ONLY</span>
            <h1>
              Two ideas.
              <br />
              The same market<span>.</span>
            </h1>
          </div>
          <a className="primary" href="/agents">
            Create your own mission ↗
          </a>
        </div>
        <Notice text={error} />
        {!data && !error && (
          <div className="chart-skeleton">Loading this comparison…</div>
        )}
        {data && (
          <>
            <p className="compare-caption">
              Live-data paper trading · $10,000 initial capital per agent ·
              Simulated execution with 0.1% fees. Published by the account
              owner.
            </p>
            <div className="mission-chart">
              <Curve
                series={data.agents.map((x) => x.curve)}
                labels={data.agents.map((x) => x.plan.name)}
              />
            </div>
            <div className="mission-two">
              {data.agents.map((m, i) => {
                const eq = m.curve.at(-1)?.equity ?? data.initialQuote;
                return (
                  <section className="mission-block" key={m.id}>
                    <span className="overline">
                      PATH {i ? "B" : "A"} / {m.status}
                    </span>
                    <h2>{m.plan.name}</h2>
                    <div className="stat-strip">
                      <div>
                        <small>Latest observed equity</small>
                        <strong>{usd(eq)}</strong>
                      </div>
                      <div>
                        <small>Net return</small>
                        <strong>
                          {fmt((eq / data.initialQuote - 1) * 100)}%
                        </strong>
                      </div>
                      <div>
                        <small>Fills</small>
                        <strong>{m.fills.length}</strong>
                      </div>
                      <div>
                        <small>Fees</small>
                        <strong>
                          {usd(m.fills.reduce((s, f) => s + f.fee, 0))}
                        </strong>
                      </div>
                    </div>
                    <p className="compare-caption">
                      {m.plan.symbol} · {m.plan.timeframe} ·{" "}
                      {m.plan.strategy.replaceAll("_", " ")}
                      <br />${m.plan.orderQuote} entry ·{" "}
                      {m.plan.confirmationBars} confirming bars
                      <br />
                      {m.plan.stopLossPct}% stop / {m.plan.takeProfitPct}%
                      target · {m.plan.durationHours} hours
                      <br />
                      Started:{" "}
                      {m.started_at
                        ? new Date(m.started_at).toLocaleString()
                        : "Not started"}
                    </p>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Side</th>
                            <th>Price</th>
                            <th>Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.fills
                            .slice(-15)
                            .reverse()
                            .map((f, j) => (
                              <tr key={j}>
                                <td>
                                  {new Date(f.created_at).toLocaleTimeString()}
                                </td>
                                <td>{f.side}</td>
                                <td>{fmt(f.price / 100)}</td>
                                <td>{fmt(f.quantity / 1e6, 6)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="compare-caption">
              These are observed virtual results, not evidence of future
              profitability. Each agent has independent liquidity consumption.
              Pauses or differing durations may affect comparability.
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}
