# AlgoTy — Milad's 2026-09-11 review fixes

## Phase 1: Rule engine coverage (indicators + price action)
- [x] engine.py: standard Wilder RSI/ATR, MACD family, Bollinger family, stochastic, WMA, VWAP (rolling + UTC session), ADX, CCI, Williams %R, change %, body/range %, volume SMA, swing high/low pivots
- [x] engine.py: pattern op (engulfing, hammer, shooting star, doji, inside/outside bar, three soldiers/crows, morning/evening star, higher high / lower low / higher low / lower high) and rising/falling op
- [x] Validation: per-kind parameters, budgets, unknown fields rejected
- [x] Tests: every indicator checked against an independent pandas reference; every pattern on hand-built candles
- [x] AI prompt (service.py) lists the full library; studio.js / mission-graph.mjs render and edit every kind and op
- [x] Test: python unittest green; existing missions still validate

## Phase 2: Replay results people can understand
- [x] Plain-language verdict card (window length, trades, wins/losses, vs buy & hold, sample-size warning)
- [x] Trade list (entry → exit, P&L %, reason) and buy & hold line + fill markers on the curve
- [x] Stat labels explained; empty "path so far" replaced by a status-aware message for drafts
- [x] Test: browser check with a real replay

## Phase 3: Flow editor room
- [x] Editor modal uses the viewport (wide canvas + side inspector on desktop, stacked on mobile)
- [x] Indicator library panel in the editor (what exists, what each means)
- [x] Test: desktop + mobile screenshots

## Phase 4: Landing motion
- [x] Hero: handwriting draws itself, headline letters rise in, magnetic CTA
- [x] Markets: real 5-hour sparklines (live feed) draw in when in view
- [x] Experience: trading panel tilts with the pointer, live fill ticker, $10,000 counter
- [x] Mission story: reasoning step types itself out
- [x] Reduced-motion respected; no layout shift; mobile checked

## Phase 5: Ship
- [x] Python worker restarted, web rebuilt via infra/build-web.sh, public site verified (NUC Chrome: coin webgl, letters, magnetic, sparklines, tilt, count-up)
- [x] Docs updated (v3 README library table), commit + push

**Complete?** [x]
