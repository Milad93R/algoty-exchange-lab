# AlgoTy live markets + mission agents — implementation checklist

Approved scope: a usable live-data paper exchange with personalized AI missions, versioned plans, parallel agent accounts and an intentionally designed web experience. Orders never leave AlgoTy. A checked item requires implementation and verification; screenshots alone do not count.

## 1. Data and execution
- [x] Test public REST and WebSocket market feeds directly from yusam; document provider and endpoints.
- [x] Go live feed for BTC/USDT, ETH/USDT, SOL/USDT; depth, trades, candles, timestamps, reconnection and stale status.
- [x] Market, limit and linked OCO orders with precision, single reservations, fees, depth-aware partial execution and cancellation.
- [x] Conservative resting-limit model, capacity consumption, idempotent execution and durable settlement.
- [x] Reject stale market execution; label source, fee and simulation assumptions.

## 2. Accounts and financial core
- [x] Java registration/login/logout, salted password hashing, expiring sessions, throttling and account isolation.
- [x] Guest entry with an upgrade path; recover registered account on another browser.
- [x] Virtual wallets and ledger; available/reserved funds, positions, P&L and order/fill history.
- [x] Persist data across restarts; validate race/dedup/insufficient-balance and cross-user boundaries.

## 3. AI missions
- [x] Natural-language brief -> LLM-generated structured plan with explicit supported rules and unresolved questions.
- [x] Editable preview: market, timeframe, entry/exit, allocation, order cap, daily trade cap and expiry.
- [x] Explicit activation; no trading while draft; deterministic limits outside the LLM.
- [x] Background runtime checks closed bars, records evidence and decisions, submits actual paper orders.
- [x] Pause/resume/stop, cancel mission orders, version changes with a new draft.
- [x] Branch to second agent with equal starting capital and a shared future start; compare curves, returns, drawdown, fees and activity without claiming guaranteed winners.
- [x] Natural-language mission controls with confirmation preview; safe handling of unsupported requests, malformed output, stale data, model errors and cost quotas.
- [x] Shareable read-only comparison links; explicitly publish only selected agent results, not credentials/account data.

## 4. Product design
- [x] Two image-generated art-direction concepts; choose and implement coherent visual direction.
- [x] Landing communicates live-market paper trading + delegatable AI missions; clear CTAs.
- [x] Responsive workstation: live candles, order book, order ticket, portfolio, orders and fill detail.
- [x] Mission control: brief composer, plan editor, status/activity, version/branch controls and comparison.
- [x] Account screens, empty/error/loading/stale states, local watchlist, keyboard/focus and mobile navigation.
- [x] Purposeful motion and reduced-motion support; preserve A-first rotating hero, loading and asset cache.

## 5. Release and evidence
- [x] Meaningful automated domain/API tests; real upstream/LLM smoke tests without exposing credentials.
- [x] Browser desktop/mobile journeys: account, order, cancellation, mission preview/activate/pause/branch/compare/share.
- [x] Server restarts and stale upstream checks; relevant resource bounds and endpoint rate limits.
- [x] Live domain validation, screenshots, runbook, source references, limitations and completed checklist.

Constraints: no full Next build/typecheck on yusam; retain preview classification until a build is performed on a suitable machine. No real-money trading, deposits, withdrawals, employer messages or legacy data deletion. Keep original system isolated while upgrading; preserve source/data. V1 research is a historical baseline, not evidence of AI returns. News/RL/social feeds, margin, derivatives, external brokerage execution, arbitrary user-code execution, email delivery and exchange queue-exact simulation are not required for this release.

## Verification closeout

Implementation and verification completed on 2026-09-07. See [verification details](VERIFICATION.md), [runbook](RUNBOOK.md), and `evidence/` for the checks behind these ticks. “Complete” here means the approved public-preview scope above, not a production build or a profitability claim. Live agent observation recorded WAIT conditions; dispatch failure/success paths used explicit deterministic test fixtures, and live paper settlement was separately verified.
