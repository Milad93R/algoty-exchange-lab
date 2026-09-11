# AlgoTy — Drakdoo parity + Smart Money Concepts (2026-09-11)

## Phase 1: Indicator parity with Drakdoo (engine.py + tests)
- [x] Moving averages: HMA, DEMA; Keltner channel (upper/middle/lower); Donchian via highest/lowest (exists)
- [x] Ichimoku: tenkan, kijun, senkouA, senkouB, chikou; SuperTrend value + direction; Parabolic SAR value + direction
- [x] Directional: diPlus, diMinus (with ADX); Momentum: MFI, CMF, CMO, PGO, ROC, momentum, KDJ (J line), OBV; TD Sequential setup count
- [x] Fibonacci retracement level of the last swing range (fib operand with level param)
- [x] Modifier operand: average/max/min/stdev/direction/sign of any operand over N bars
- [x] Custom formula op (safe expression over a, b, open, high, low, close)
- [x] Tests: pandas / hand-computed references for every new kind

## Phase 2: Pattern parity with Drakdoo
- [x] Candles: gravestone/dragonfly doji, bull/bear marubozu, inverted hammer, hanging man, bull/bear harami, spinning top, piercing line, dark cloud cover, three inside up/down
- [x] Chart: double top/bottom, cup (with/without handle, pivot-based), Bollinger squeeze, inside-bar breakout up/down
- [x] Divergence: regular/hidden bullish/bearish between price and RSI/MACD histogram (pivot based)
- [x] Harmonics: Gartley, Bat, Butterfly, Crab (XABCD ratio windows on last five pivots)
- [x] Support/resistance: near/broken long-term level (pivot clusters)
- [x] Tests on hand-built candles for every pattern

## Phase 3: Smart Money Concepts
- [x] Structure: swing + internal structure trend, BOS bullish/bearish, CHoCH bullish/bearish (LuxAlgo-style definitions)
- [x] Order blocks: latest bullish/bearish OB top/bottom (last opposing candle before displacement + BOS), in-OB, mitigated, breaker
- [x] Fair value gaps: bullish/bearish FVG formed, latest unfilled FVG top/bottom, price inside FVG
- [x] Liquidity: equal highs/lows (ATR tolerance), buy-side/sell-side sweep (wick beyond swing, close back inside), displacement candle
- [x] Premium/discount: range position 0–100 between last swing low/high, inPremium/inDiscount/atEquilibrium
- [x] Sessions and levels: Asia/London/New York session high/low, previous day/week high/low
- [x] Tests on scripted candle scenarios for every concept

## Phase 4: Scanner and alerts (Exchange Probe equivalent)
- [x] Worker `/scan`: evaluate a flow's entry and exit across BTC/ETH/SOL × 1m/5m/15m/1h with traces
- [x] Java route + Next proxy; studio "Where does this hold right now?" grid with per-cell evidence
- [x] Watch-only mission mode: journals ALERT events on state change and emails the owner, never trades
- [x] Tests: API + browser (scan grid, formula/modifier editors, watch-only ALERT without fills)

## Phase 5: Studio, AI, docs, ship
- [x] library.mjs groups/params/patterns/modifier editor/formula editor; graph nodes; AI prompt; v3 README tables
- [ ] Python tests green; worker restarted; Java rebuilt if touched; web rebuilt via infra/build-web.sh; public verified
- [ ] Commit + push

**Complete?** [ ]
