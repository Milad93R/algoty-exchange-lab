import {
  CHART_TIMEFRAME_DETAILS,
  MARKET_SYMBOLS,
} from "../../components/product/market-config";

const SYMBOLS = new Set(MARKET_SYMBOLS);

export async function GET(request) {
  const search = new URL(request.url).searchParams;
  const symbol = search.get("symbol") || "BTCUSDT";
  const timeframe = search.get("timeframe") || "1m";
  const endTimeText = search.get("endTime");
  const endTime = endTimeText === null ? null : Number(endTimeText);
  const liveCacheSeconds = CHART_TIMEFRAME_DETAILS[timeframe]?.cacheSeconds;
  const cacheSeconds = endTime === null ? liveCacheSeconds : 3_600;

  if (
    !SYMBOLS.has(symbol) ||
    !liveCacheSeconds ||
    (endTimeText !== null && (!Number.isSafeInteger(endTime) || endTime <= 0))
  ) {
    return Response.json(
      { error: "Unknown market or timeframe" },
      { status: 400 },
    );
  }

  try {
    const query = new URLSearchParams({
      symbol,
      interval: timeframe,
      limit: "1000",
    });
    if (endTime !== null) query.set("endTime", String(endTime));
    const response = await fetch(
      `https://data-api.binance.vision/api/v3/klines?${query}`,
      {
        next: { revalidate: cacheSeconds },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) throw Error(`Binance returned ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw Error("Invalid Binance response");

    const candles = rows
      .filter((row) => Array.isArray(row) && row.length >= 7)
      .map((row) => ({
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closed: Number(row[6]) < Date.now(),
      }));

    return Response.json(
      {
        symbol,
        timeframe,
        source: "Binance public market data",
        candles,
        hasMore: candles.length === 1_000,
        nextEndTime: candles.length ? candles[0].time - 1 : null,
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`,
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Chart history is temporarily unavailable" },
      { status: 503 },
    );
  }
}
