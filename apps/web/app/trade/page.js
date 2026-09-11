"use client";
import Link from 'next/link';
import { useEffect, useState, useRef } from "react";
import {
  api,
  useUser,
  useMarket,
  useModal,
  Shell,
  Notice,
  Candles,
  fmt,
  usd,
} from "../components/product/common";
export default function Trade() {
  const { user, error } = useUser();
  const [symbol, setSymbol] = useState("BTCUSDT"),
    [tf, setTf] = useState("1m"),
    [portfolio, setPortfolio] = useState(null),
    [side, setSide] = useState("BUY"),
    [kind, setKind] = useState("MARKET"),
    [price, setPrice] = useState(""),
    [quantity, setQuantity] = useState("0.001"),
    [tab, setTab] = useState("orders"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(null);
  const key = useRef(null);
  useModal(!!detail, () => setDetail(null));
  const market = useMarket(symbol);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("symbol");
    if (["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(q)) setSymbol(q);
  }, []);
  async function refresh() {
    try {
      setPortfolio(await api("portfolio"));
    } catch (e) {
      setNotice(e.message);
    }
  }
  useEffect(() => {
    if (!user) return;
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [user]);
  useEffect(() => {
    key.current = null;
  }, [symbol, side, kind, price, quantity]);
  const asset = symbol.replace("USDT", ""),
    best =
      (side === "BUY" ? market?.asks?.[0]?.price : market?.bids?.[0]?.price) ||
      0;
  const last = market?.candles?.at(-1)?.close || best / 100;
  const estimate =
    Number(quantity || 0) *
    (kind === "MARKET" ? best / 100 : Number(price || 0));
  const available = portfolio?.balances?.find(
    (b) => b.asset === (side === "BUY" ? "USDT" : asset),
  );
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      key.current ??= crypto.randomUUID();
      await api("orders", {
        symbol,
        side,
        kind,
        quantity: Math.round(Number(quantity) * 1e6),
        price: Math.round(Number(price || 0) * 100),
        key: key.current,
      });
      key.current = null;
      setNotice("Order accepted. Follow its fills below.");
      await refresh();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const orders = portfolio?.orders || [],
    fills = portfolio?.fills || [];
  return (
    <Shell active="trade" user={user}>
      <div className="workspace-heading">
        <div>
          <span className="overline">THE EXCHANGE</span>
          <h1>
            Find your next move<span>.</span>
          </h1>
        </div>
        <div className="workspace-summary">
          <span>
            Portfolio equity
            <b>{portfolio?.equity == null ? "—" : usd(portfolio.equity)}</b>
          </span>
          <span>
            Net change
            <b className={portfolio?.equity >= 1e12 ? "up" : "down"}>
              {portfolio?.equity == null ? "—" : usd(portfolio.equity - 1e12)}
            </b>
          </span>
          <Link href="/agents">Delegate to an agent ↗</Link>
        </div>
      </div>
      <Notice text={notice || error} clear={() => setNotice("")} />
      <div className="market-ribbon">
        <div className="symbol-select">
          <span className="coin-symbol">
            {asset === "BTC" ? "₿" : asset === "ETH" ? "Ξ" : "◎"}
          </span>
          <select
            aria-label="Market"
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setPrice("");
            }}
          >
            {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((s) => (
              <option key={s} value={s}>
                {s.replace("USDT", " / USDT")}
              </option>
            ))}
          </select>
        </div>
        <strong>{last ? "$" + fmt(last) : "—"}</strong>
        <span className="market-spread">
          Spread{" "}
          <b>
            {market?.asks?.length
              ? fmt((market.asks[0].price - market.bids[0].price) / 100)
              : "—"}
          </b>
        </span>
        <span
          className={"feed-state " + (!market || market.stale ? "waiting" : "")}
        >
          <i />
          {!market
            ? "Connecting"
            : market.stale
              ? "Reconnecting · execution paused"
              : "Live market"}
        </span>
        <span className="timestamp">
          {market?.updated
            ? new Date(market.updated).toLocaleTimeString()
            : "—"}
        </span>
      </div>
      <div className="exchange-grid">
        <section className="chart-panel">
          <div className="panel-heading">
            <span>PRICE ACTION</span>
            <div>
              {["1m", "5m"].map((t) => (
                <button
                  key={t}
                  className={tf === t ? "active" : ""}
                  onClick={() => setTf(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <span>Spot · Paper execution</span>
          </div>
          <Candles rows={market?.candles} timeframe={tf} />
        </section>
        <section className="depth-panel">
          <div className="panel-heading">
            ORDER BOOK <small>8 levels / side</small>
          </div>
          <div className="book-labels">
            <span>Price / USDT</span>
            <span>{asset}</span>
          </div>
          {["asks", "bids"].map((type) => (
            <div key={type} className={"book-side " + type}>
              {type === "bids" && (
                <div className="book-mid">
                  {last ? fmt(last) : "—"} <span>↕</span>
                </div>
              )}
              {(market?.[type] || [])
                .slice(0, 8)
                .sort((a, b) =>
                  type === "asks" ? b.price - a.price : b.price - a.price,
                )
                .map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setKind("LIMIT");
                      setPrice(String(r.price / 100));
                    }}
                  >
                    <i
                      style={{
                        width:
                          Math.min(
                            100,
                            (r.quantity /
                              Math.max(
                                ...(market?.[type] || [])
                                  .slice(0, 8)
                                  .map((x) => x.quantity),
                              )) *
                              100,
                          ) + "%",
                      }}
                    />
                    <span>{fmt(r.price / 100)}</span>
                    <span>{fmt(r.quantity / 1e6, 5)}</span>
                  </button>
                ))}
            </div>
          ))}
          <p className="micro-note">
            Live external liquidity. Paper orders do not change the Binance
            book.
          </p>
        </section>
        <section className="ticket-panel">
          <div className="panel-heading">
            MAKE A MOVE <span>↗</span>
          </div>
          <form onSubmit={submit}>
            <div className="side-switch">
              {["BUY", "SELL"].map((s) => (
                <button
                  type="button"
                  key={s}
                  className={s === side ? "active " + s.toLowerCase() : ""}
                  onClick={() => setSide(s)}
                >
                  {s === "BUY" ? "Buy" : "Sell"} {asset}
                </button>
              ))}
            </div>
            <div className="ticket-kind">
              {["MARKET", "LIMIT"].map((k) => (
                <button
                  type="button"
                  key={k}
                  className={kind === k ? "active" : ""}
                  onClick={() => setKind(k)}
                >
                  {k === "MARKET" ? "Market" : "Limit"}
                </button>
              ))}
            </div>
            <label>
              Price <span>USDT</span>
              <input
                aria-label="Limit price"
                type="number"
                min="0.01"
                step="0.01"
                disabled={kind === "MARKET"}
                value={kind === "MARKET" ? "" : price}
                placeholder={
                  kind === "MARKET"
                    ? "Best available price"
                    : "Enter limit price"
                }
                required={kind === "LIMIT"}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Quantity <span>{asset}</span>
              <input
                aria-label="Order quantity"
                type="number"
                min="0.000001"
                step="0.000001"
                max="1000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <div className="available">
              Available{" "}
              <b>
                {available
                  ? fmt(
                      (available.total - available.reserved) /
                        (side === "BUY" ? 1e8 : 1e6),
                      side === "BUY" ? 2 : 6,
                    )
                  : "—"}{" "}
                {side === "BUY" ? "USDT" : asset}
              </b>
            </div>
            <div className="ticket-estimate">
              <span>
                Estimated value<b>${fmt(estimate)}</b>
              </span>
              <span>
                Fee · 0.1%<b>${fmt(estimate * 0.001, 4)}</b>
              </span>
            </div>
            <button
              className={"primary place " + (side === "SELL" ? "sell" : "")}
              disabled={busy || !user || !market || market.stale}
            >
              {busy ? "Placing…" : `Place ${side.toLowerCase()} order`}{" "}
              <span>↗</span>
            </button>
            <p className="micro-note">
              {kind === "MARKET"
                ? "1% price protection. Unfilled remainder is canceled."
                : "Resting orders need an observed trade through your price. Touching the price alone does not guarantee a fill."}
            </p>
          </form>
        </section>
      </div>
      <section className="portfolio-section">
        <div className="portfolio-tabs">
          {[
            ["orders", "Orders"],
            ["fills", "Trade history"],
            ["positions", "Positions"],
            ["balances", "Assets"],
            ["ledger", "Account ledger"],
          ].map(([id, label]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "orders" && (
                <small>
                  {
                    orders.filter((o) => ["OPEN", "PARTIAL"].includes(o.status))
                      .length
                  }
                </small>
              )}
            </button>
          ))}
          <span>
            {portfolio?.balanced ? "● Ledger balanced" : "Checking account…"}
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {(tab === "orders"
                  ? [
                      "Market / time",
                      "Side",
                      "Type",
                      "Price",
                      "Quantity",
                      "Filled",
                      "Status",
                      "",
                    ]
                  : tab === "fills"
                    ? ["Market / time", "Side", "Price", "Quantity", "Fee", ""]
                    : tab === "positions"
                      ? [
                          "Market",
                          "Quantity",
                          "Average entry incl. fees",
                          "Unrealized P&L",
                          "Realized P&L",
                        ]
                      : tab === "balances"
                        ? ["Asset", "Total", "Reserved", "Available"]
                        : ["Time", "Asset", "Movement", "Event"]
                ).map((t, i) => (
                  <th key={i}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab === "orders" &&
                orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.symbol}
                      <small>{new Date(o.created_at).toLocaleString()}</small>
                    </td>
                    <td className={o.side === "BUY" ? "up" : "down"}>
                      {o.side}
                    </td>
                    <td>{o.kind}</td>
                    <td>
                      {o.kind === "MARKET" ? "Market" : fmt(o.price / 100)}
                    </td>
                    <td>{fmt(o.quantity / 1e6, 6)}</td>
                    <td>{fmt((o.quantity - o.remaining) / 1e6, 6)}</td>
                    <td>
                      <span className={"order-status " + o.status}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      {["OPEN", "PARTIAL"].includes(o.status) && (
                        <button
                          onClick={async () => {
                            try {
                              await api("orders/" + o.id + "/cancel", {});
                              await refresh();
                            } catch (e) {
                              setNotice(e.message);
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              {tab === "fills" &&
                fills.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.symbol}
                      <small>
                        {new Date(f.created_at).toLocaleTimeString()}
                      </small>
                    </td>
                    <td className={f.side === "BUY" ? "up" : "down"}>
                      {f.side}
                    </td>
                    <td>{fmt(f.price / 100)}</td>
                    <td>{fmt(f.quantity / 1e6, 6)}</td>
                    <td>{usd(f.fee)}</td>
                    <td>
                      <button onClick={() => setDetail(f)}>
                        Inspect fill ↗
                      </button>
                    </td>
                  </tr>
                ))}
              {tab === "positions" &&
                portfolio?.positions?.map((p) => (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td>{fmt(p.quantity / 1e6, 6)}</td>
                    <td>{p.quantity ? fmt(p.entryPrice) : "—"}</td>
                    <td className={p.unrealized >= 0 ? "up" : "down"}>
                      {p.unrealized == null
                        ? "Awaiting fresh price"
                        : usd(p.unrealized)}
                    </td>
                    <td className={p.realized >= 0 ? "up" : "down"}>
                      {usd(p.realized)}
                    </td>
                  </tr>
                ))}
              {tab === "balances" &&
                portfolio?.balances?.map((b) => (
                  <tr key={b.asset}>
                    <td>{b.asset}</td>
                    {["total", "reserved"].map((k) => (
                      <td key={k}>
                        {fmt(
                          b[k] / (b.asset === "USDT" ? 1e8 : 1e6),
                          b.asset === "USDT" ? 2 : 6,
                        )}
                      </td>
                    ))}
                    <td>
                      {fmt(
                        (b.total - b.reserved) /
                          (b.asset === "USDT" ? 1e8 : 1e6),
                        b.asset === "USDT" ? 2 : 6,
                      )}
                    </td>
                  </tr>
                ))}
              {tab === "ledger" &&
                portfolio?.ledger?.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.asset}</td>
                    <td className={l.amount >= 0 ? "up" : "down"}>
                      {fmt(l.amount / (l.asset === "USDT" ? 1e8 : 1e6), 6)}
                    </td>
                    <td className="mono">{l.event_id.slice(-20)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {((tab === "orders" && !orders.length) ||
            (tab === "fills" && !fills.length)) && (
            <div className="empty-state">
              <span>↗</span>
              <h3>
                {tab === "orders"
                  ? "Your first move starts here."
                  : "Every execution has a story."}
              </h3>
              <p>
                {tab === "orders"
                  ? "Choose a market and place your first paper order."
                  : "Completed fills and their market evidence will appear here."}
              </p>
            </div>
          )}
        </div>
      </section>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Execution detail"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setDetail(null)}>
              ×
            </button>
            <span className="overline">EXECUTION RECEIPT</span>
            <h2>Inside the fill.</h2>
            <p>
              {detail.side} {fmt(detail.quantity / 1e6, 6)}{" "}
              {detail.symbol.replace("USDT", "")} at ${fmt(detail.price / 100)}
            </p>
            <dl>
              <dt>Fee</dt>
              <dd>{usd(detail.fee)}</dd>
              <dt>Observed</dt>
              <dd>
                {new Date(
                  JSON.parse(detail.evidence).observedAt,
                ).toLocaleString()}
              </dd>
              <dt>Market sequence</dt>
              <dd>{JSON.parse(detail.evidence).sequence}</dd>
              <dt>Model</dt>
              <dd>{JSON.parse(detail.evidence).model}</dd>
            </dl>
            <p className="micro-note">
              This receipt describes a paper execution using observed market
              data. It is not an order sent to Binance.
            </p>
          </section>
        </div>
      )}
    </Shell>
  );
}
