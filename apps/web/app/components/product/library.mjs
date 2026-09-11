// Rule library shown in the studio. Mirrors workers/mission-python/engine.py; the worker validates.
export const GROUPS = [
  {
    name: "Price",
    kinds: [
      ["close", "Close", "Closing price of the candle."],
      ["open", "Open", "Opening price."],
      ["high", "High", "Candle high."],
      ["low", "Low", "Candle low."],
      ["hl2", "Mid price", "(High + Low) / 2."],
      ["typical", "Typical price", "(High + Low + Close) / 3."],
      ["change", "Change %", "Close change over the period, in percent.", ["period"]],
      ["bodyPct", "Body %", "Signed candle body as % of open."],
      ["rangePct", "Range %", "High-to-low range as % of open."],
    ],
  },
  {
    name: "Trend",
    kinds: [
      ["sma", "SMA", "Simple moving average of closes.", ["period"]],
      ["ema", "EMA", "Exponential moving average, seeded by the first-period mean.", ["period"]],
      ["wma", "WMA", "Linearly weighted moving average.", ["period"]],
      ["vwap", "VWAP (rolling)", "Volume-weighted average price over the period.", ["period"]],
      ["vwapSession", "VWAP (UTC day)", "Volume-weighted average price since 00:00 UTC."],
      ["macd", "MACD line", "EMA fast − EMA slow.", ["fast", "slow", "signal"]],
      ["macdSignal", "MACD signal", "EMA of the MACD line.", ["fast", "slow", "signal"]],
      ["macdHist", "MACD histogram", "MACD line − signal.", ["fast", "slow", "signal"]],
      ["adx", "ADX", "Trend strength 0–100 (Wilder).", ["period"]],
    ],
  },
  {
    name: "Momentum",
    kinds: [
      ["rsi", "RSI", "Relative strength 0–100 (Wilder smoothing).", ["period"]],
      ["stochK", "Stochastic %K", "Close position inside the period range, 0–100.", ["period", "smooth"]],
      ["stochD", "Stochastic %D", "Average of %K over the smoothing length.", ["period", "smooth"]],
      ["cci", "CCI", "Commodity channel index.", ["period"]],
      ["williamsR", "Williams %R", "−100 (bottom of range) to 0 (top).", ["period"]],
    ],
  },
  {
    name: "Volatility & bands",
    kinds: [
      ["atr", "ATR", "Average true range (Wilder).", ["period"]],
      ["bbUpper", "Bollinger upper", "SMA + mult × standard deviation.", ["period", "mult"]],
      ["bbMiddle", "Bollinger middle", "SMA of closes.", ["period", "mult"]],
      ["bbLower", "Bollinger lower", "SMA − mult × standard deviation.", ["period", "mult"]],
      ["bbWidth", "Bollinger width %", "(Upper − lower) / middle × 100.", ["period", "mult"]],
      ["bbPercent", "Bollinger %B", "Position of close inside the bands, 0–100.", ["period", "mult"]],
    ],
  },
  {
    name: "Range & structure",
    kinds: [
      ["highest", "Highest high", "Highest high of the period (use offset 1 for a prior range).", ["period"]],
      ["lowest", "Lowest low", "Lowest low of the period.", ["period"]],
      ["swingHigh", "Swing high", "Last confirmed pivot high with the period's bars on each side.", ["period"]],
      ["swingLow", "Swing low", "Last confirmed pivot low.", ["period"]],
    ],
  },
  {
    name: "Volume",
    kinds: [
      ["volume", "Volume", "Candle volume."],
      ["volumeSma", "Volume average", "Simple average of volume.", ["period"]],
      ["volumeRatio", "Volume ratio", "Current volume / previous-period average.", ["period"]],
    ],
  },
];
export const KINDS = Object.fromEntries(
  GROUPS.flatMap((g) => g.kinds.map(([k, name, help, params = []]) => [k, { name, help, params, group: g.name }])),
);
export const PARAM_DEFAULTS = { period: 14, fast: 12, slow: 26, signal: 9, mult: 2, smooth: 3 };
export const paramDefault = (kind, p) => (p === "period" && kind.startsWith("bb") ? 20 : PARAM_DEFAULTS[p]);
export const PARAM_LABELS = { period: "Period", fast: "Fast", slow: "Slow", signal: "Signal", mult: "Multiplier", smooth: "Smoothing" };
export const PATTERNS = [
  ["bullishEngulfing", "Bullish engulfing", "A down candle fully covered by the next up candle."],
  ["bearishEngulfing", "Bearish engulfing", "An up candle fully covered by the next down candle."],
  ["hammer", "Hammer", "Small body at the top, lower wick at least twice the body."],
  ["shootingStar", "Shooting star", "Small body at the bottom, upper wick at least twice the body."],
  ["doji", "Doji", "Body within 10% of the candle range."],
  ["insideBar", "Inside bar", "High and low inside the previous candle."],
  ["outsideBar", "Outside bar", "High and low beyond the previous candle."],
  ["threeWhiteSoldiers", "Three white soldiers", "Three strong up candles, each opening inside the last body."],
  ["threeBlackCrows", "Three black crows", "Three strong down candles, each opening inside the last body."],
  ["morningStar", "Morning star", "Long down candle, small candle, up candle closing above the first midpoint."],
  ["eveningStar", "Evening star", "Long up candle, small candle, down candle closing below the first midpoint."],
  ["higherHigh", "Higher high", "Latest swing high above the previous swing high."],
  ["lowerLow", "Lower low", "Latest swing low below the previous swing low."],
  ["higherLow", "Higher low", "Latest swing low above the previous swing low."],
  ["lowerHigh", "Lower high", "Latest swing high below the previous swing high."],
];
export const PATTERN_NAMES = Object.fromEntries(PATTERNS.map(([k, name]) => [k, name]));
export const SWING_PATTERNS = ["higherHigh", "lowerLow", "higherLow", "lowerHigh"];
export const OPS = [
  "gt", "gte", "lt", "lte", "crossAbove", "crossBelow",
  "rising", "falling", "pattern",
  "all", "any", "not", "consecutive", "sequence", "schedule",
];
export const WORDS = {
  gt: "is above",
  gte: "is at least",
  lt: "is below",
  lte: "is at most",
  crossAbove: "crosses above",
  crossBelow: "crosses below",
  rising: "is rising for",
  falling: "is falling for",
  pattern: "Candle pattern",
  all: "All conditions",
  any: "Any condition",
  not: "Invert condition",
  consecutive: "Consecutive closes",
  sequence: "In this order",
  schedule: "Trading hours · UTC",
};
export function describeOperand(v) {
  if (typeof v === "number") return String(v);
  const k = KINDS[v?.kind];
  if (!k) return v?.kind || "—";
  const params = k.params.map((p) => v[p] ?? paramDefault(v.kind, p));
  const ctx = [v.symbol && v.symbol.replace("USDT", ""), v.timeframe].filter(Boolean).join(" / ");
  return `${k.name}${params.length ? " " + params.join("/") : ""}${v.offset ? " · " + v.offset + " back" : ""}${ctx ? " · " + ctx : ""}`;
}
export function describeNode(n) {
  if (n.op === "pattern") return `${PATTERN_NAMES[n.name] || n.name}${SWING_PATTERNS.includes(n.name) ? " · strength " + (n.period || 5) : ""}`;
  if (n.op === "rising" || n.op === "falling") return `${describeOperand(n.left)} ${WORDS[n.op]} ${n.bars} bars`;
  if (n.left !== undefined) return `${describeOperand(n.left)} ${WORDS[n.op]} ${describeOperand(n.right)}`;
  return `${WORDS[n.op]}${n.bars ? " · " + n.bars : ""}${n.within ? " · " + n.within + " bars" : ""}${n.op === "schedule" ? " · " + n.startHour + "–" + n.endHour : ""}`;
}
