export const MARKET_SYMBOLS = Object.freeze([
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
]);

export const CHART_TIMEFRAMES = Object.freeze([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
]);

export const CHART_TIMEFRAME_DETAILS = Object.freeze({
  "1m": { durationMs: 60_000, refreshMs: 10_000, cacheSeconds: 5 },
  "5m": { durationMs: 300_000, refreshMs: 15_000, cacheSeconds: 10 },
  "15m": { durationMs: 900_000, refreshMs: 20_000, cacheSeconds: 15 },
  "30m": { durationMs: 1_800_000, refreshMs: 20_000, cacheSeconds: 15 },
  "1h": { durationMs: 3_600_000, refreshMs: 30_000, cacheSeconds: 30 },
  "4h": { durationMs: 14_400_000, refreshMs: 60_000, cacheSeconds: 60 },
  "1d": { durationMs: 86_400_000, refreshMs: 300_000, cacheSeconds: 300 },
});
