# Verification — 2026-09-07

## Passed evidence

| Area | Evidence |
|---|---|
| Provider selection | `../v2/provider-probe.json`: Binance, Kraken and Coinbase REST reachable; Binance depth/trade/candle WS received from yusam |
| Go execution | `evidence/go-tests.txt`: five tests with race detector; depth capacity, retry/conflict, restart persistence, strict resting trade-through, stale rejection/cancel resolution, failed save rollback, concurrency and case-sensitive Binance candle decoding |
| Python mission worker | `evidence/python-tests.txt`: seven test methods; completed bars, confirmation/volume, SMA/RSI, cost-based exit, typed plans, entry dispatch, AI veto/malformed/provider failure and stale-feed skip |
| Financial/API lifecycle | `evidence/api.json`: live market fill and fees, precision rejection, idempotency, cancellation, identity upgrade/login/recovery, ownership, real LLM draft/control/branch, paired start, sharing privacy |
| Independent balance check | `evidence/boundaries.json`: parallel reservations cannot overspend; every v2 balance reconciles against user-owned ledger movements; auth throttle; internal-route and cross-origin rejection |
| Restart | `evidence/runtime.json`: Java/Go restart retains account, balanced ledger and open order; order can be canceled afterward |
| Background observation | `evidence/runtime.json`, `evidence/agent-observation.json`: agent records decisions from newly completed live candles |
| AI boundaries | `evidence/ai-boundaries.json`: actual unsupported brief returns questions, activation fails; provider budget survives worker restart |
| Browser journeys | `evidence/browser.json`: exchange order/cancel/fill receipt, registration, AI plan/editor/activation/pause, instruction/version, branch/paired start/share; no page errors |
| Responsive layouts | `evidence/responsive.json`, mobile PNGs: 390, 768 and 1024 widths; no document overflow, tables scroll locally |
| Loading and motion | `evidence/loading.json`, `evidence/accessibility.json`: cold-load cover, six cached brand assets, repeat cache hits, animated/default and static/reduced-motion sculpture, modal focus trap/Escape |
| Public domain | `evidence/public.json`: https://algoty.com, live SSE and fresh 20-level source book, guest identity, HttpOnly/Secure/SameSite cookie, mobile missions; no page errors |
| Cleanup | `evidence/cleanup.json`: test missions stopped; real user records were not deleted |

## What this does and does not establish

- The real LLM was exercised for plan construction, control proposals, branching and unsupported requests. Entry approval/veto/error dispatch was exercised with deterministic provider fixtures. Manual paper orders settled against live Binance depth.
- During the separately recorded live agent observation, qualifying entry conditions were not met; the correct result was **WAIT**. That observation is not presented as an AI trade, profit or a successful strategy. The raw evidence remains available.
- Go/Python unit fixtures exercise reproducible rare failures; they are not exchange market-performance results.
- Screenshots show implemented interfaces with QA-owned virtual accounts. Recovery codes are masked in screenshots. No customer account was used.
- The web runs as a public Next preview, not a production build. Full Next builds/typechecks remain prohibited on yusam. No throughput/SLA claim was validated.
- Equity curves are sampled, and long series are thinned for display. Stop/target checks are at candle close. Resting fills use a conservative observation model, not exact Binance queue position.

## Defects caught and corrected during verification

1. Go struct decoding conflated Binance uppercase/lowercase candle fields; switched to explicit case-sensitive field lookup and added a real-schema regression fixture.
2. A share token was incorrectly treated as a login token by the web proxy; cookie handling is now restricted to identity endpoints. Browser test confirms sharing preserves the authenticated session and works without login.
3. Receipt cleanup could forget current capacity; pruning now removes only obsolete snapshots/trades.
4. Recovery verification was rechecked under the transaction to prevent concurrent reuse; financial integer fields and mission text/list fields reject malformed values.
5. Mission entry limits count buys only; position basis includes all open-position fills/fees; final states cannot be bypassed through pause/resume.
