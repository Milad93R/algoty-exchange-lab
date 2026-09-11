# Mission Studio (2026-09-08)

Open `/agents`: describe a mission, start with a flow template, or import a JSON definition. Inspect/edit conditions, save the draft, run a historical replay, then explicitly activate. Editing a running mission creates a new inactive version. Natural-language instructions are proposals until confirmed.

## What runs

- `CUSTOM` plans retain mission sizing/lifecycle fields and add `flow.version=1`, `entry`, `exit`, `risk`.
- Rule operators: all/any/not, gt/gte/lt/lte, crossAbove/crossBelow, consecutive, sequence, UTC schedule.
- Operands: constants; OHLCV, SMA, EMA, simple-average RSI, ATR, rolling highest/lowest and volume ratio. Periods 2–200, offsets 0–50. Each can reference BTC/ETH/SOL and 1m/5m/15m/1h independently. Each mission executes only its main market.
- Price/range periods include the current closed candle; use offset=1 for a prior range. EMA uses the first-period SMA seed in the available history. RSI uses simple window means, not Wilder smoothing. ATR uses the simple average of true ranges. Missing warmup is `waiting`, never an invented value.
- A sequence's final event must occur now; earlier children must match in strictly chronological order within the configured window. A schedule with equal endpoints means all day; overnight windows supported. AND/OR evaluate all children to make evidence inspectable.
- Fixed notional entry size; scale-ins 1–5 per position; maximum total allocation; daily entry cap; partial rule exits 1–100%; fixed stop and optional target (0 disables target); optional trailing close stop; cooldown after fills; daily equity-loss entry gate. Protective exits always request the full remaining position. Long-only spot. Java owns funds, allocation, entry count, loss limit and settlement. Worker state preserves trailing peak across restarts.
- Composable execution is deterministic from the reviewed plan. The older three strategies remain compatible and retain their earlier AI entry veto. AI generates/edits definitions, not hidden runtime discretionary rules for custom flows.
- Rules are bounded to 40 nodes, depth 6, 8 children and 500 expanded temporal evaluations. No arbitrary Python, code execution, custom feeds, news, leverage, shorting or automatic multi-asset allocation. Unsupported AI requests must remain questions/clarifications.

## Historical replay vs live paper execution

Both use `engine.py` for rule evaluation, closed-candle timing and trace. Replay fetches a recent 500-candle window from Binance market-only REST, reserves 220 main-market candles as warmup and fills on the **next candle open**, at 0.1% fee per fill plus user-selected slippage. Results include the plan's SHA256, actual dates, curve, drawdown, buy-and-hold benchmark, fees and inspectable decisions. Final holdings are marked without forced liquidation, as is the benchmark. Indicator context filters every source to candles already closed at the decision timestamp.

Replay is deliberately a candle execution model: no depth, queue priority, funding, market impact or exchange-specific lot rules. Live paper orders continue to use Go's fresh book/trade evidence and durable receipts. Results are not identical fill models and are not forecasts. Live equity-loss gate uses the first sampled equity of the UTC day (initial funding before any sample); replay uses first evaluated daily equity. Live traces are limited to recent journal entries, replay to the displayed recent window.

## User interface

Warm ivory/ink/orange visual identity, connected condition tree, focused node inspector, live values/statuses, execution receipts, allocation/protection panels, replay scrubber/playback, import/export and three editable starter flows. Compact indented graph on narrow screens. Reduced-motion disables graph animation; no new raster assets were necessary for this interactive interface. Original landing/coin/first-load cover and brand-asset-only cache preserved.

## Operations and verification

Same v2 ports and PM2 names. New modules `workers/mission-python/engine.py` and `studio.py`; additive `v2_missions.flow_state` schema column. Restart Python for worker changes; bounded Java bootJar + core restart for core changes. Next remains a **dev/public preview**, not a production build: full Next builds/typechecks are prohibited on yusam.

Evidence in `docs/v3/evidence`:
- Python regression + new engine tests: validation, bounded temporal work, no-future context, indicators, sequence, crossings, exits, replay timing/costs.
- API: owner isolation, invalid flow rejection, real Binance replay, Java scale-in cap, 25% partial exit/full protective exit, ledger balance, active-version immutability, actual LLM multi-market plan.
- Live runner: deliberately always-true QA rule caused an autonomous paper fill from Binance live book. This proves integration, **not profitability**. Test mission stopped afterward.
- Browser: template → edit → save → replay → inspect → playback → edit; responsive and public checks recorded separately.
- AI instruction test: real model produced an edit proposal, stored plan remained unchanged; unsupported short/leverage/news instruction was clarified.
