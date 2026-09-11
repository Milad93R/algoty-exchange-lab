# Mission Studio (2026-09-08)

Open `/agents`: describe a mission, start with a flow template, or import a JSON definition. Inspect/edit conditions, save the draft, run a historical replay, then explicitly activate. Editing a running mission creates a new inactive version. Natural-language instructions are proposals until confirmed.

## What runs

- `CUSTOM` plans retain mission sizing/lifecycle fields and add `flow.version=1`, `entry`, `exit`, `risk`.
- Rule operators: all/any/not, gt/gte/lt/lte, crossAbove/crossBelow, rising/falling (an operand moved the same way for N bars), pattern (candle and swing-structure patterns), consecutive, sequence, UTC schedule.
- Operand library (2026-09-11, Drakdoo parity + smart money), all on closed candles, each with optional symbol/timeframe/offset:
  - Price: open, high, low, close, volume, hl2, typical, change %, momentum, bodyPct, rangePct, obv, tdSetup (TD Sequential count).
  - Trend: sma, ema, wma, hma, dema, vwap (rolling) / vwapSession (UTC day), macd / macdSignal / macdHist, adx / diPlus / diMinus, superTrend / superTrendDir, psar / psarDir, Ichimoku tenkan / kijun / senkouA / senkouB, sslUp / sslDown.
  - Momentum: rsi (Wilder), stochK / stochD, kdjK / kdjD / kdjJ, cci, williamsR, mfi, cmf, cmo, pgo.
  - Volatility and bands: atr (Wilder), bbUpper / bbMiddle / bbLower / bbWidth / bbPercent, keltnerUpper / keltnerMiddle / keltnerLower.
  - Range and structure: highest, lowest, swingHigh, swingLow, fibLevel (retracement of the last swing leg), supportLevel / resistanceLevel (pivot clusters with 2+ touches).
  - Smart money: structureTrend, obBullTop / obBullBottom / obBearTop / obBearBottom (latest unmitigated order block), fvgBullTop / fvgBullBottom / fvgBearTop / fvgBearBottom (latest unfilled gap), rangePosition (0–100 between last swing low and high).
  - Sessions and levels: sessionHigh / sessionLow (asia 00–08, london 07–16, newyork 12–21 UTC), dayOpen, prevDayHigh / prevDayLow / prevDayClose, prevWeekHigh / prevWeekLow. Daily and weekly levels return `waiting` unless the loaded window covers the full previous day/week, so use a 15m or 1h context.
  - Modifier operand `{kind:"mod", fn, of, length, ma}`: average (SMA/EMA/HMA), max, min, stdev, direction, sign, lookback of any operand over N bars; two nesting levels.
  - Patterns (op `pattern`): 24 candle patterns; structure/chart (higher high, lower low, higher low, lower high, double top/bottom, cup, Bollinger squeeze, inside-bar breakouts, near/broke support/resistance); divergence (regular and hidden, RSI or MACD histogram); harmonics (Gartley, Bat, Butterfly, Crab, bullish and bearish); smart money (BOS, CHoCH, inside/tapped order block, breakers, FVG formed/inside, equal highs/lows, liquidity sweeps, displacement, premium/discount/equilibrium).
  - Ops: comparisons, crossings, rising/falling, pattern, custom `formula` (`a/b > 1.5` over a, b, open, high, low, close, volume; whitelisted AST only), all/any/not, consecutive, sequence, schedule.
  Periods 2–200, offsets 0–50, Bollinger/Keltner multiplier 0.5–5, MACD fast < slow. Missing warmup is `waiting`, never an invented value. `test_library.py` and `test_parity.py` check every indicator against an independent pandas or hand-written reference and every pattern on scripted candles. Smart-money definitions follow LuxAlgo conventions on confirmed swings (pivot strength = `period`).
- Scanner: `POST /api/v2/missions/{id}/scan` evaluates the mission's entry and exit rules on the latest closed candle of BTC/ETH/SOL × 1m/5m/15m/1h and returns per-cell status and trace (the studio shows a grid; pick a cell to read its evidence). This is the Drakdoo "exchange probe" equivalent for the three supported markets.
- Watch-only missions: `plan.mode = "watch"` activates like a trading mission but never places orders. Each new BUY/SELL signal is journaled as an `ALERT` event and emailed to the owner's verified address through Resend.
- Legacy note: before 2026-09-11 RSI and ATR used simple window means; they now use standard Wilder smoothing, so old missions built on RSI/ATR thresholds evaluate slightly differently.
- A sequence's final event must occur now; earlier children must match in strictly chronological order within the configured window. A schedule with equal endpoints means all day; overnight windows supported. AND/OR evaluate all children to make evidence inspectable.
- Fixed notional entry size; scale-ins 1–5 per position; maximum total allocation; daily entry cap; partial rule exits 1–100%; fixed stop and optional target (0 disables target); optional trailing close stop; cooldown after fills; daily equity-loss entry gate. Protective exits always request the full remaining position. Long-only spot. Java owns funds, allocation, entry count, loss limit and settlement. Worker state preserves trailing peak across restarts.
- Composable execution is deterministic from the reviewed plan. The older three strategies remain compatible and retain their earlier AI entry veto. AI generates/edits definitions, not hidden runtime discretionary rules for custom flows.
- Rules are bounded to 40 nodes, depth 6, 8 children and 500 expanded temporal evaluations. No arbitrary Python, code execution, custom feeds, news, leverage, shorting or automatic multi-asset allocation. Unsupported AI requests must remain questions/clarifications.

## Reading a replay

The replay panel opens with a plain-language verdict (window length, positions opened, wins/losses, what $10,000 became, buy-and-hold comparison, and a sample-size warning below 10 closed trades or one day), explained stat labels, an equity curve with the buy-and-hold line and buy/sell markers, and a round-trip table (entry → exit, result, why it closed). The scrubber then walks the flow through every candle.

## Historical replay vs live paper execution

Both use `engine.py` for rule evaluation, closed-candle timing and trace. Replay fetches a recent 500-candle window from Binance market-only REST, reserves 220 main-market candles as warmup and fills on the **next candle open**, at 0.1% fee per fill plus user-selected slippage. Results include the plan's SHA256, actual dates, curve, drawdown, buy-and-hold benchmark, fees and inspectable decisions. Final holdings are marked without forced liquidation, as is the benchmark. Indicator context filters every source to candles already closed at the decision timestamp.

Replay is deliberately a candle execution model: no depth, queue priority, funding, market impact or exchange-specific lot rules. Live paper orders continue to use Go's fresh book/trade evidence and durable receipts. Results are not identical fill models and are not forecasts. Live equity-loss gate uses the first sampled equity of the UTC day (initial funding before any sample); replay uses first evaluated daily equity. Live traces are limited to recent journal entries, replay to the displayed recent window.

## User interface

Warm ivory/ink/orange visual identity, connected condition tree, focused node inspector, live values/statuses, execution receipts, allocation/protection panels, replay scrubber/playback, import/export and three editable starter flows. Compact indented graph on narrow screens. Reduced-motion disables graph animation; no new raster assets were necessary for this interactive interface. Original landing/coin/first-load cover and brand-asset-only cache preserved.

## Operations and verification

Same v2 ports and PM2 names. New modules `workers/mission-python/engine.py` and `studio.py`; additive `v2_missions.flow_state` schema column. Restart Python for worker changes; bounded Java bootJar + core restart for core changes. The web app is a production build served by `next start`; it is built on a separate machine with `infra/build-web.sh` because full Next builds/typechecks are prohibited on yusam.

Evidence in `docs/v3/evidence`:
- Python regression + new engine tests: validation, bounded temporal work, no-future context, indicators, sequence, crossings, exits, replay timing/costs.
- API: owner isolation, invalid flow rejection, real Binance replay, Java scale-in cap, 25% partial exit/full protective exit, ledger balance, active-version immutability, actual LLM multi-market plan.
- Live runner: deliberately always-true QA rule caused an autonomous paper fill from Binance live book. This proves integration, **not profitability**. Test mission stopped afterward.
- Browser: template → edit → save → replay → inspect → playback → edit; responsive and public checks recorded separately.
- AI instruction test: real model produced an edit proposal, stored plan remained unchanged; unsupported short/leverage/news instruction was clarified.
