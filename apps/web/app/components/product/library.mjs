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
      ["hma", "HMA", "Hull moving average, fast and smooth.", ["period"]],
      ["dema", "DEMA", "Double exponential moving average.", ["period"]],
      ["superTrend", "SuperTrend", "ATR trailing line; price above it means bullish.", ["period", "mult"]],
      ["superTrendDir", "SuperTrend direction", "+1 bullish, −1 bearish.", ["period", "mult"]],
      ["psar", "Parabolic SAR", "Stop-and-reverse dots.", ["step", "maxStep"]],
      ["psarDir", "Parabolic SAR direction", "+1 bullish, −1 bearish.", ["step", "maxStep"]],
      ["tenkan", "Ichimoku conversion", "Midpoint of the conversion-period range.", ["conversion", "base", "lagging", "displacement"]],
      ["kijun", "Ichimoku base", "Midpoint of the base-period range.", ["conversion", "base", "lagging", "displacement"]],
      ["senkouA", "Ichimoku span A", "Cloud edge A, displaced forward.", ["conversion", "base", "lagging", "displacement"]],
      ["senkouB", "Ichimoku span B", "Cloud edge B, displaced forward.", ["conversion", "base", "lagging", "displacement"]],
      ["sslUp", "SSL channel upper", "SSL channel line above price.", ["period"]],
      ["sslDown", "SSL channel lower", "SSL channel line below price.", ["period"]],
      ["vwap", "VWAP (rolling)", "Volume-weighted average price over the period.", ["period"]],
      ["vwapSession", "VWAP (UTC day)", "Volume-weighted average price since 00:00 UTC."],
      ["macd", "MACD line", "EMA fast − EMA slow.", ["fast", "slow", "signal"]],
      ["macdSignal", "MACD signal", "EMA of the MACD line.", ["fast", "slow", "signal"]],
      ["macdHist", "MACD histogram", "MACD line − signal.", ["fast", "slow", "signal"]],
      ["adx", "ADX", "Trend strength 0–100 (Wilder).", ["period"]],
      ["diPlus", "+DI", "Positive directional index.", ["period"]],
      ["diMinus", "−DI", "Negative directional index.", ["period"]],
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
      ["mfi", "MFI", "Money flow index 0–100.", ["period"]],
      ["cmf", "CMF", "Chaikin money flow −1..1.", ["period"]],
      ["cmo", "CMO", "Chande momentum oscillator −100..100.", ["period"]],
      ["pgo", "PGO", "Pretty good oscillator: distance from SMA in ATRs.", ["period"]],
      ["momentum", "Momentum", "Close minus close N bars ago.", ["period"]],
      ["kdjK", "KDJ %K", "Smoothed stochastic K.", ["period", "smooth"]],
      ["kdjD", "KDJ %D", "Smoothed K.", ["period", "smooth"]],
      ["kdjJ", "KDJ %J", "3K − 2D.", ["period", "smooth"]],
      ["tdSetup", "TD Sequential setup", "+n buy setup count, −n sell setup count (9 completes).", []],
      ["obv", "OBV", "On-balance volume over the loaded window.", []],
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
      ["keltnerUpper", "Keltner upper", "EMA + mult × ATR.", ["period", "mult"]],
      ["keltnerMiddle", "Keltner middle", "EMA of closes.", ["period", "mult"]],
      ["keltnerLower", "Keltner lower", "EMA − mult × ATR.", ["period", "mult"]],
    ],
  },
  {
    name: "Range & structure",
    kinds: [
      ["highest", "Highest high", "Highest high of the period (use offset 1 for a prior range).", ["period"]],
      ["lowest", "Lowest low", "Lowest low of the period.", ["period"]],
      ["swingHigh", "Swing high", "Last confirmed pivot high with the period's bars on each side.", ["period"]],
      ["swingLow", "Swing low", "Last confirmed pivot low.", ["period"]],
      ["fibLevel", "Fibonacci level", "Retracement level of the last swing leg (0.618 by default).", ["period", "level"]],
      ["supportLevel", "Support level", "Nearest pivot cluster below price (2+ touches).", ["period"]],
      ["resistanceLevel", "Resistance level", "Nearest pivot cluster above price.", ["period"]],
    ],
  },
  {
    name: "Smart money",
    kinds: [
      ["structureTrend", "Structure trend", "+1 after a bullish break, −1 after a bearish break.", ["period"]],
      ["obBullTop", "Bullish order block top", "Latest unmitigated bullish OB, top edge.", ["period"]],
      ["obBullBottom", "Bullish order block bottom", "Latest unmitigated bullish OB, bottom edge.", ["period"]],
      ["obBearTop", "Bearish order block top", "Latest unmitigated bearish OB, top edge.", ["period"]],
      ["obBearBottom", "Bearish order block bottom", "Latest unmitigated bearish OB, bottom edge.", ["period"]],
      ["fvgBullTop", "Bullish FVG top", "Latest unfilled bullish fair value gap, top.", []],
      ["fvgBullBottom", "Bullish FVG bottom", "Latest unfilled bullish fair value gap, bottom.", []],
      ["fvgBearTop", "Bearish FVG top", "Latest unfilled bearish fair value gap, top.", []],
      ["fvgBearBottom", "Bearish FVG bottom", "Latest unfilled bearish fair value gap, bottom.", []],
      ["rangePosition", "Range position", "0 at the last swing low, 100 at the last swing high (50 = equilibrium).", ["period"]],
    ],
  },
  {
    name: "Sessions & levels",
    kinds: [
      ["sessionHigh", "Session high", "High of the Asia / London / New York session (UTC).", ["session"]],
      ["sessionLow", "Session low", "Low of the chosen session.", ["session"]],
      ["prevDayHigh", "Previous day high", "Needs enough history: use a 15m or 1h context.", []],
      ["prevDayLow", "Previous day low", "Needs enough history: use a 15m or 1h context.", []],
      ["prevDayClose", "Previous day close", "Last close of the previous UTC day.", []],
      ["dayOpen", "Day open", "First open of the current UTC day.", []],
      ["prevWeekHigh", "Previous week high", "Needs a 1h context.", []],
      ["prevWeekLow", "Previous week low", "Needs a 1h context.", []],
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
export const PARAM_DEFAULTS = { period: 14, fast: 12, slow: 26, signal: 9, mult: 2, smooth: 3, conversion: 9, base: 26, lagging: 52, displacement: 26, step: 0.02, maxStep: 0.2, level: 0.618, session: "london" };
export const paramDefault = (kind, p) => (p === "period" && (kind.startsWith("bb") || kind.startsWith("keltner")) ? 20 : p === "period" && kind === "superTrend" ? 10 : p === "mult" && kind.startsWith("superTrend") ? 3 : PARAM_DEFAULTS[p]);
export const PARAM_LABELS = { period: "Period", fast: "Fast", slow: "Slow", signal: "Signal", mult: "Multiplier", smooth: "Smoothing", conversion: "Conversion", base: "Base", lagging: "Lagging span", displacement: "Displacement", step: "Step", maxStep: "Max step", level: "Level (0–1)", session: "Session" };
export const PARAM_RANGES = { mult: [0.5, 5, 0.1], step: [0.001, 0.2, 0.001], maxStep: [0.01, 1, 0.01], level: [0, 1, 0.001], displacement: [0, 100, 1] };
export const SESSIONS = ["asia", "london", "newyork"];
export const MOD_FUNCTIONS = [
  ["average", "Average of", "SMA / EMA / HMA of the value over N bars"],
  ["max", "Maximum of", "highest value in the last N bars"],
  ["min", "Minimum of", "lowest value in the last N bars"],
  ["stdev", "Std. deviation of", "population standard deviation over N bars"],
  ["direction", "Direction of", "+1 rising every bar, −1 falling every bar, else 0"],
  ["sign", "Sign of", "+1 all positive, −1 all negative, else 0"],
  ["lookback", "Look back", "the value N bars ago"],
];
export const PATTERN_GROUPS = [
  ["Candles", ["bullishEngulfing", "bearishEngulfing", "hammer", "invertedHammer", "hangingMan", "shootingStar", "doji", "gravestoneDoji", "dragonflyDoji", "marubozuBullish", "marubozuBearish", "spinningTop", "haramiBullish", "haramiBearish", "piercingLine", "darkCloudCover", "insideBar", "outsideBar", "threeWhiteSoldiers", "threeBlackCrows", "threeInsideUp", "threeInsideDown", "morningStar", "eveningStar"]],
  ["Structure & chart", ["higherHigh", "lowerLow", "higherLow", "lowerHigh", "doubleTop", "doubleBottom", "cup", "bbSqueeze", "insideBarBreakoutUp", "insideBarBreakoutDown", "nearSupport", "nearResistance", "brokeSupport", "brokeResistance"]],
  ["Divergence", ["divergenceBullish", "divergenceBearish", "hiddenDivergenceBullish", "hiddenDivergenceBearish"]],
  ["Harmonics", ["gartleyBullish", "gartleyBearish", "batBullish", "batBearish", "butterflyBullish", "butterflyBearish", "crabBullish", "crabBearish"]],
  ["Smart money", ["bosBullish", "bosBearish", "chochBullish", "chochBearish", "inBullishOB", "inBearishOB", "obBullMitigated", "obBearMitigated", "breakerBullish", "breakerBearish", "fvgBullish", "fvgBearish", "inBullishFVG", "inBearishFVG", "equalHighs", "equalLows", "sweepHigh", "sweepLow", "displacementUp", "displacementDown", "inPremium", "inDiscount", "atEquilibrium"]],
];
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
  ["gravestoneDoji", "Gravestone doji", "Doji with a long upper wick and no lower wick."],
  ["dragonflyDoji", "Dragonfly doji", "Doji with a long lower wick and no upper wick."],
  ["marubozuBullish", "Bullish marubozu", "Up candle with almost no wicks."],
  ["marubozuBearish", "Bearish marubozu", "Down candle with almost no wicks."],
  ["invertedHammer", "Inverted hammer", "Shooting-star shape after a down candle."],
  ["hangingMan", "Hanging man", "Hammer shape after an up candle."],
  ["haramiBullish", "Bullish harami", "Small up candle inside the previous down body."],
  ["haramiBearish", "Bearish harami", "Small down candle inside the previous up body."],
  ["spinningTop", "Spinning top", "Small body with wicks on both sides."],
  ["piercingLine", "Piercing line", "Opens below the prior down close, closes above its midpoint."],
  ["darkCloudCover", "Dark cloud cover", "Opens above the prior up close, closes below its midpoint."],
  ["threeInsideUp", "Three inside up", "Bullish harami confirmed by a third close above the first open."],
  ["threeInsideDown", "Three inside down", "Bearish harami confirmed by a third close below the first open."],
  ["doubleTop", "Double top", "Two equal swing highs and a close below the neckline."],
  ["doubleBottom", "Double bottom", "Two equal swing lows and a close above the neckline."],
  ["cup", "Cup", "Rounded decline of 5%+ that recovers to the rim (approximate)."],
  ["bbSqueeze", "Bollinger squeeze", "Band width at its 100-bar minimum."],
  ["insideBarBreakoutUp", "Inside bar breakout up", "Close above the mother candle high."],
  ["insideBarBreakoutDown", "Inside bar breakout down", "Close below the mother candle low."],
  ["nearSupport", "Near support", "Close within half an ATR of a support cluster."],
  ["nearResistance", "Near resistance", "Close within half an ATR of a resistance cluster."],
  ["brokeSupport", "Broke support", "Close moved below a support cluster this bar."],
  ["brokeResistance", "Broke resistance", "Close moved above a resistance cluster this bar."],
  ["divergenceBullish", "Bullish divergence", "Price lower low, oscillator higher low (RSI or MACD histogram)."],
  ["divergenceBearish", "Bearish divergence", "Price higher high, oscillator lower high."],
  ["hiddenDivergenceBullish", "Hidden bullish divergence", "Price higher low, oscillator lower low."],
  ["hiddenDivergenceBearish", "Hidden bearish divergence", "Price lower high, oscillator higher high."],
  ["gartleyBullish", "Gartley (bullish)", "XABCD with AB 0.618, AD 0.786 of XA, ending at a low."],
  ["gartleyBearish", "Gartley (bearish)", "Mirror image ending at a high."],
  ["batBullish", "Bat (bullish)", "AB 0.382–0.5, AD 0.886 of XA."],
  ["batBearish", "Bat (bearish)", "Mirror image ending at a high."],
  ["butterflyBullish", "Butterfly (bullish)", "AB 0.786, AD 1.27–1.618 of XA."],
  ["butterflyBearish", "Butterfly (bearish)", "Mirror image ending at a high."],
  ["crabBullish", "Crab (bullish)", "AD 1.618 of XA, CD 2.24–3.618 of BC."],
  ["crabBearish", "Crab (bearish)", "Mirror image ending at a high."],
  ["bosBullish", "Break of structure (bullish)", "Close above the last swing high while already bullish."],
  ["bosBearish", "Break of structure (bearish)", "Close below the last swing low while already bearish."],
  ["chochBullish", "Change of character (bullish)", "First close above a swing high after a bearish structure."],
  ["chochBearish", "Change of character (bearish)", "First close below a swing low after a bullish structure."],
  ["inBullishOB", "Inside bullish order block", "Close inside the latest unmitigated bullish OB."],
  ["inBearishOB", "Inside bearish order block", "Close inside the latest unmitigated bearish OB."],
  ["obBullMitigated", "Bullish OB tapped", "Price is touching the bullish order block."],
  ["obBearMitigated", "Bearish OB tapped", "Price is touching the bearish order block."],
  ["breakerBullish", "Bullish breaker", "Close just broke up through a failed bearish order block."],
  ["breakerBearish", "Bearish breaker", "Close just broke down through a failed bullish order block."],
  ["fvgBullish", "Bullish FVG formed", "This candle's low is above the high two candles back."],
  ["fvgBearish", "Bearish FVG formed", "This candle's high is below the low two candles back."],
  ["inBullishFVG", "Inside bullish FVG", "Close inside the latest unfilled bullish gap."],
  ["inBearishFVG", "Inside bearish FVG", "Close inside the latest unfilled bearish gap."],
  ["equalHighs", "Equal highs", "Last two swing highs within 0.1 ATR (resting liquidity)."],
  ["equalLows", "Equal lows", "Last two swing lows within 0.1 ATR."],
  ["sweepHigh", "Buy-side liquidity sweep", "Wick above the last swing high, close back below it."],
  ["sweepLow", "Sell-side liquidity sweep", "Wick below the last swing low, close back above it."],
  ["displacementUp", "Displacement up", "Up body larger than mult × ATR."],
  ["displacementDown", "Displacement down", "Down body larger than mult × ATR."],
  ["inPremium", "In premium", "Close in the upper half of the last swing range."],
  ["inDiscount", "In discount", "Close in the lower half of the last swing range."],
  ["atEquilibrium", "At equilibrium", "Close within 2.5% of the range midpoint."],
];
export const SWING_PATTERN_SET = new Set(["higherHigh", "lowerLow", "higherLow", "lowerHigh", "doubleTop", "doubleBottom", "cup", "nearSupport", "nearResistance", "brokeSupport", "brokeResistance", "divergenceBullish", "divergenceBearish", "hiddenDivergenceBullish", "hiddenDivergenceBearish", "gartleyBullish", "gartleyBearish", "batBullish", "batBearish", "butterflyBullish", "butterflyBearish", "crabBullish", "crabBearish", "bosBullish", "bosBearish", "chochBullish", "chochBearish", "inBullishOB", "inBearishOB", "obBullMitigated", "obBearMitigated", "breakerBullish", "breakerBearish", "equalHighs", "equalLows", "sweepHigh", "sweepLow", "inPremium", "inDiscount", "atEquilibrium"]);
export const DIVERGENCE_SET = new Set(["divergenceBullish", "divergenceBearish", "hiddenDivergenceBullish", "hiddenDivergenceBearish"]);
export const DISPLACEMENT_SET = new Set(["displacementUp", "displacementDown"]);
export const PATTERN_NAMES = Object.fromEntries(PATTERNS.map(([k, name]) => [k, name]));
export const SWING_PATTERNS = ["higherHigh", "lowerLow", "higherLow", "lowerHigh"];
export const OPS = [
  "gt", "gte", "lt", "lte", "crossAbove", "crossBelow",
  "rising", "falling", "pattern", "formula",
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
  pattern: "Pattern / event",
  formula: "Custom formula",
  all: "All conditions",
  any: "Any condition",
  not: "Invert condition",
  consecutive: "Consecutive closes",
  sequence: "In this order",
  schedule: "Trading hours · UTC",
};
export function describeOperand(v) {
  if (typeof v === "number") return String(v);
  if (v?.kind === "mod") {
    const fn = MOD_FUNCTIONS.find(([k]) => k === v.fn)?.[1] || v.fn;
    return `${fn} ${describeOperand(v.of)} (${v.length}${v.fn === "lookback" ? " bars ago" : " bars" + (v.fn === "average" && v.ma && v.ma !== "sma" ? " · " + v.ma.toUpperCase() : "")})`;
  }
  const k = KINDS[v?.kind];
  if (!k) return v?.kind || "—";
  const params = k.params.map((p) => v[p] ?? paramDefault(v.kind, p));
  const ctx = [v.symbol && v.symbol.replace("USDT", ""), v.timeframe].filter(Boolean).join(" / ");
  return `${k.name}${params.length ? " " + params.join("/") : ""}${v.offset ? " · " + v.offset + " back" : ""}${ctx ? " · " + ctx : ""}`;
}
export function describeNode(n) {
  if (n.op === "pattern") return `${PATTERN_NAMES[n.name] || n.name}${SWING_PATTERN_SET.has(n.name) ? " · strength " + (n.period || 5) : ""}${DIVERGENCE_SET.has(n.name) ? " · " + (n.source || "rsi") : ""}${DISPLACEMENT_SET.has(n.name) ? " · " + (n.mult || 1.5) + "× ATR" : ""}`;
  if (n.op === "formula") return `${n.expr} where a = ${describeOperand(n.left)}, b = ${describeOperand(n.right)}`;
  if (n.op === "rising" || n.op === "falling") return `${describeOperand(n.left)} ${WORDS[n.op]} ${n.bars} bars`;
  if (n.left !== undefined) return `${describeOperand(n.left)} ${WORDS[n.op]} ${describeOperand(n.right)}`;
  return `${WORDS[n.op]}${n.bars ? " · " + n.bars : ""}${n.within ? " · " + n.within + " bars" : ""}${n.op === "schedule" ? " · " + n.startHour + "–" + n.endHour : ""}`;
}
