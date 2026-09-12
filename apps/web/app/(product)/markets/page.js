"use client";
import { useEffect } from "react";
import {
  useUser,
  useMarket,
  useViewState,
  Shell,
  Candles,
  fmt,
} from "../../components/product/common";
function Market({ symbol, watched, toggle }) {
  const m = useMarket(symbol);
  return (
    <section className="market-card">
      <button
        className="watch-button"
        aria-label={(watched ? "Remove " : "Add ") + symbol + " watchlist"}
        aria-pressed={watched}
        onClick={toggle}
      >
        {watched ? "★" : "☆"}
      </button>
      <span className="overline">
        {symbol === "BTCUSDT"
          ? "BITCOIN"
          : symbol === "ETHUSDT"
            ? "ETHEREUM"
            : "SOLANA"}
      </span>
      <h2>{symbol.replace("USDT", " / USDT")}</h2>
      <span className={"feed-state " + (!m || m.stale ? "waiting" : "")}>
        <i />
        {!m ? "Connecting" : m.stale ? "Reconnecting" : "Live Binance market"}
      </span>
      <h2>{m?.candles?.length ? "$" + fmt(m.candles.at(-1).close) : "—"}</h2>
      <Candles rows={m?.candles} />
      <a className="secondary" href={"/trade?symbol=" + symbol}>
        Open market <span>↗</span>
      </a>
    </section>
  );
}
export default function Markets() {
  const { user } = useUser();
  const [savedWatch, setWatch] = useViewState("markets.watchlist", []);
  const watch = Array.isArray(savedWatch) ? savedWatch : [];
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("algoty-watchlist") || "[]");
      if (Array.isArray(saved)) setWatch(saved);
    } catch {}
  }, []);
  function toggle(s) {
    const next = watch.includes(s)
      ? watch.filter((x) => x !== s)
      : [...watch, s];
    setWatch(next);
    localStorage.setItem("algoty-watchlist", JSON.stringify(next));
  }
  return (
    <Shell user={user}>
      <div className="workspace-heading">
        <div>
          <span className="overline">A WINDOW INTO THE MARKET</span>
          <h1>
            Keep an eye on what moves<span>.</span>
          </h1>
        </div>
        <span className="compare-caption">
          Your watchlist stays on this browser.
        </span>
      </div>
      <div className="market-cards">
        {["BTCUSDT", "ETHUSDT", "SOLUSDT"]
          .sort((a, b) => Number(watch.includes(b)) - Number(watch.includes(a)))
          .map((s) => (
            <Market
              key={s}
              symbol={s}
              watched={watch.includes(s)}
              toggle={() => toggle(s)}
            />
          ))}
      </div>
    </Shell>
  );
}
