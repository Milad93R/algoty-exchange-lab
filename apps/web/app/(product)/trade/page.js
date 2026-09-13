"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  useUser,
  useMarket,
  useViewState,
  useModal,
  Shell,
  Notice,
  fmt,
  usd,
} from "../../components/product/common";
import Candles from "../../components/product/MarketChart";
import {
  dataKeys,
  useCandles,
  usePortfolio,
} from "../../components/product/server-state";
import {
  CHART_TIMEFRAMES,
  MARKET_SYMBOLS,
} from "../../components/product/market-config";

const portfolioTabs = ["orders", "fills", "positions", "balances", "ledger"];

export default function Trade() {
  const { user, error } = useUser();
  const [savedSymbol, setSymbol] = useViewState("trade.symbol", "BTCUSDT"),
    [savedTf, setTf] = useViewState("trade.timeframe", "1m"),
    [savedSide, setSide] = useViewState("trade.side", "BUY"),
    [savedKind, setKind] = useViewState("trade.kind", "MARKET"),
    [savedChartScale, setChartScale] = useViewState("trade.chart-scale", "log"),
    [price, setPrice] = useViewState("trade.price", ""),
    [stopPrice, setStopPrice] = useViewState("trade.stop-price", ""),
    [stopLimitPrice, setStopLimitPrice] = useViewState(
      "trade.stop-limit-price",
      "",
    ),
    [quantity, setQuantity] = useViewState("trade.quantity", "0.001"),
    [savedSizeMode, setSizeMode] = useViewState("trade.size-mode", "QUANTITY"),
    [amount, setAmount] = useViewState("trade.amount", "100"),
    [savedTab, setTab] = useViewState("trade.portfolio-tab", "orders"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(null);
  const symbol = MARKET_SYMBOLS.includes(savedSymbol) ? savedSymbol : "BTCUSDT";
  const tf = CHART_TIMEFRAMES.includes(savedTf) ? savedTf : "1m";
  const side = ["BUY", "SELL"].includes(savedSide) ? savedSide : "BUY";
  const kind = ["MARKET", "LIMIT", "OCO"].includes(savedKind)
    ? savedKind
    : "MARKET";
  const sizeMode = ["QUANTITY", "AMOUNT"].includes(savedSizeMode)
    ? savedSizeMode
    : "QUANTITY";
  const logarithmicScale = savedChartScale !== "linear";
  const tab = portfolioTabs.includes(savedTab) ? savedTab : "orders";
  const queryClient = useQueryClient();
  const portfolioQuery = usePortfolio(user?.id);
  const portfolio = portfolioQuery.data || null;
  const key = useRef(null);
  useModal(!!detail, () => setDetail(null));
  const market = useMarket(symbol);
  const candlesQuery = useCandles(symbol, tf);
  const chartHistory = candlesQuery.data?.candles || [];
  const chartRows =
    chartHistory.length > 0
      ? chartHistory
      : tf === "1m"
        ? market?.candles || []
        : [];
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("symbol");
    if (MARKET_SYMBOLS.includes(q)) setSymbol(q);
  }, []);
  async function refresh() {
    const result = await portfolioQuery.refetch();
    if (result.error) throw result.error;
    return result.data;
  }
  useEffect(() => {
    key.current = null;
  }, [
    symbol,
    side,
    kind,
    price,
    stopPrice,
    stopLimitPrice,
    quantity,
    amount,
    sizeMode,
  ]);
  const asset = symbol.replace("USDT", ""),
    best =
      (side === "BUY" ? market?.asks?.[0]?.price : market?.bids?.[0]?.price) ||
      0;
  const last = market?.candles?.at(-1)?.close || best / 100;
  const estimatePrice =
    kind === "MARKET"
      ? best / 100
      : kind === "OCO" && side === "BUY"
        ? Math.max(Number(price || 0), Number(stopLimitPrice || 0))
        : Number(price || 0);
  const quantityUnits =
    sizeMode === "AMOUNT"
      ? estimatePrice > 0
        ? Math.floor((Number(amount || 0) / estimatePrice) * 1e6)
        : 0
      : Math.round(Number(quantity || 0) * 1e6);
  const orderQuantity = quantityUnits / 1e6;
  const estimate = orderQuantity * estimatePrice;
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
        quantity: quantityUnits,
        price: Math.round(Number(price || 0) * 100),
        ...(kind === "OCO"
          ? {
              stopPrice: Math.round(Number(stopPrice || 0) * 100),
              stopLimitPrice: Math.round(Number(stopLimitPrice || 0) * 100),
            }
          : {}),
        key: key.current,
      });
      key.current = null;
      setNotice(
        kind === "OCO"
          ? "OCO accepted. Its limit and stop-limit legs are linked."
          : "Order accepted. Follow its fills below.",
      );
      await queryClient.invalidateQueries({
        queryKey: dataKeys.portfolio(user.id),
      });
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const orders = portfolio?.orders || [],
    fills = portfolio?.fills || [];
  return (
    <Shell user={user}>
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
      <Notice
        text={notice || error || portfolioQuery.error?.message}
        clear={() => setNotice("")}
      />
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
              setStopPrice("");
              setStopLimitPrice("");
            }}
          >
            {MARKET_SYMBOLS.map((s) => (
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
            <div
              className="chart-timeframes"
              role="group"
              aria-label="Chart timeframe"
            >
              {CHART_TIMEFRAMES.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={tf === t ? "active" : ""}
                  aria-pressed={tf === t}
                  onClick={() => setTf(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <span>Drag · scroll · pinch</span>
          </div>
          <Candles
            key={`${symbol}:${tf}`}
            rows={chartRows}
            timeframe={tf}
            sourceTimeframe={chartHistory.length > 0 ? tf : "1m"}
            error={candlesQuery.error?.message || candlesQuery.historyError}
            onLoadOlder={candlesQuery.loadOlder}
            loadingOlder={candlesQuery.isFetchingOlder}
            hasMore={candlesQuery.hasMore}
            logarithmic={logarithmicScale}
            onLogarithmicChange={(enabled) =>
              setChartScale(enabled ? "log" : "linear")
            }
          />
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
              {["MARKET", "LIMIT", "OCO"].map((k) => (
                <button
                  type="button"
                  key={k}
                  className={kind === k ? "active" : ""}
                  onClick={() => setKind(k)}
                >
                  {k === "MARKET" ? "Market" : k === "LIMIT" ? "Limit" : "OCO"}
                </button>
              ))}
            </div>
            <label>
              {kind === "OCO" ? "Limit leg price" : "Price"} <span>USDT</span>
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
                required={kind !== "MARKET"}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            {kind === "OCO" && (
              <>
                <label>
                  Stop trigger <span>USDT</span>
                  <input
                    aria-label="OCO stop trigger"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={stopPrice}
                    placeholder={
                      side === "SELL" ? "Below market" : "Above market"
                    }
                    required
                    onChange={(e) => setStopPrice(e.target.value)}
                  />
                </label>
                <label>
                  Stop-limit price <span>USDT</span>
                  <input
                    aria-label="OCO stop-limit price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={stopLimitPrice}
                    placeholder={
                      side === "SELL"
                        ? "At or below trigger"
                        : "At or above trigger"
                    }
                    required
                    onChange={(e) => setStopLimitPrice(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="size-entry">
              <div
                className="size-mode"
                role="group"
                aria-label="Order size input"
              >
                <button
                  type="button"
                  className={sizeMode === "QUANTITY" ? "active" : ""}
                  aria-pressed={sizeMode === "QUANTITY"}
                  onClick={() => setSizeMode("QUANTITY")}
                >
                  Quantity
                </button>
                <button
                  type="button"
                  className={sizeMode === "AMOUNT" ? "active" : ""}
                  aria-pressed={sizeMode === "AMOUNT"}
                  onClick={() => setSizeMode("AMOUNT")}
                >
                  Amount
                </button>
              </div>
              {sizeMode === "QUANTITY" ? (
                <label>
                  Order quantity <span>{asset}</span>
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
              ) : (
                <label>
                  {side === "BUY" ? "Purchase amount" : "Order value"}{" "}
                  <span>USDT</span>
                  <input
                    aria-label="Order amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max="10000000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
              )}
            </div>
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
              {sizeMode === "AMOUNT" && (
                <span>
                  Converted quantity
                  <b>
                    {fmt(orderQuantity, 6)} {asset}
                  </b>
                </span>
              )}
              <span>
                {kind === "OCO" && side === "BUY"
                  ? "Maximum reserved value"
                  : "Estimated value"}
                <b>${fmt(estimate)}</b>
              </span>
              <span>
                Fee · 0.1%<b>${fmt(estimate * 0.001, 4)}</b>
              </span>
            </div>
            <button
              className={"primary place " + (side === "SELL" ? "sell" : "")}
              disabled={
                busy || !user || !market || market.stale || quantityUnits < 1
              }
            >
              {busy
                ? "Placing…"
                : `Place ${side.toLowerCase()}${kind === "OCO" ? " OCO" : " order"}`}{" "}
              <span>↗</span>
            </button>
            <p className="micro-note">
              {kind === "MARKET"
                ? "1% price protection. Unfilled remainder is canceled."
                : kind === "LIMIT"
                  ? "Resting orders need an observed trade through your price. Touching the price alone does not guarantee a fill."
                  : side === "SELL"
                    ? "The limit leg must be above market; the stop is below it. The first limit fill or stop trigger cancels the other leg."
                    : "The limit leg must be below market; the stop is above it. The first limit fill or stop trigger cancels the other leg."}
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
                      "Price / legs",
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
                    <td>
                      {o.kind}
                      {o.kind === "OCO" && (
                        <small>
                          {o.active_leg === "STOP_LIMIT"
                            ? "Stop leg active"
                            : o.active_leg === "LIMIT"
                              ? "Limit leg active"
                              : "2 linked legs"}
                        </small>
                      )}
                    </td>
                    <td>
                      {o.kind === "MARKET" ? "Market" : fmt(o.price / 100)}
                      {o.kind === "OCO" && (
                        <small>
                          Stop {fmt(o.stop_price / 100)} →{" "}
                          {fmt(o.stop_limit_price / 100)}
                        </small>
                      )}
                    </td>
                    <td>{fmt(o.quantity / 1e6, 6)}</td>
                    <td>{fmt((o.quantity - o.remaining) / 1e6, 6)}</td>
                    <td>
                      <span
                        className={
                          "order-status " +
                          (o.kind === "OCO" &&
                          o.active_leg === "STOP_LIMIT" &&
                          ["OPEN", "PARTIAL"].includes(o.status)
                            ? "TRIGGERED"
                            : o.status)
                        }
                      >
                        {o.kind === "OCO" &&
                        o.active_leg === "STOP_LIMIT" &&
                        ["OPEN", "PARTIAL"].includes(o.status)
                          ? "TRIGGERED"
                          : o.status}
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
