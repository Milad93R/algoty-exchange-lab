# AlgoTy v2 — live-market paper exchange and AI missions

## Product

AlgoTy gives each visitor a virtual USDT portfolio, live Binance spot-market data, and a workstation for BTC/USDT, ETH/USDT and SOL/USDT. A natural-language AI brief creates a structured draft; the user reviews it before activation. Agents observe future closed candles, run bounded entry/exit rules and record their reasoning and paper executions. Branching creates two fresh accounts with equal capital and a shared start.

The production-facing domain is https://algoty.com. This deployment remains a **public preview**. Full Next builds/typechecks are prohibited on yusam, so the web app is built remotely with `infra/build-web.sh` (ROG laptop over the reverse tunnel, or automatically the NUC via `mc:/host` + `docker run node:20-alpine` when the laptop tunnel is down) and served with `next start`. `infra/ecosystem.config.cjs` passes `apps/web/.env.local` to the process explicitly and clears the inherited `__NEXT_PROCESSED_ENV` flag, which otherwise makes `next start` ignore env files. No scalability, profitability, real exchange employment or real-money custody claim follows from this deployment.

## Service ownership

| Service | Responsibility | Loopback port | PM2 |
|---|---|---|---|
| Next.js | Landing, workstation, mission control, identity screens, restricted API proxy, SSE | 18200 | exchange-lab-web |
| Java / Spring Boot | Identity, reservations, ledger, settlement, mission authorization/lifecycle, persistence | 18201 | exchange-lab-core |
| Go live market | Binance WS feed, book/trade/candle state, deterministic paper execution receipts | 18203 | exchange-live-market |
| Python worker | LLM planning/controls, signal evaluation, entry review, background decisions | 18205 | exchange-mission-worker |
| PostgreSQL 16 | Durable application records | 18204 | Docker exchange-lab-postgres |

Old v1 matching on 18202 and historical research sources are retained as a baseline. The new product does not route user orders through that matcher. Legacy AlgoTy containers in `self/AlgoTy` remain stopped; their data and the separate résumé website remain preserved.

## Market source and execution contract

Chosen after successful REST and WS tests from yusam's IP. Public market-only Binance endpoints require no account or trading key:

- REST: `https://data-api.binance.vision/api/v3/klines`
- WS: `wss://data-stream.binance.vision:443/stream`
- Streams per symbol: `depth20@100ms`, `aggTrade`, `kline_1m`.
- The Exchange chart opens with up to 1,000 REST candles for 1m, 5m, 15m, 30m, 1h, 4h, 1d and 1w. Reaching the left edge requests the next Binance page with `endTime`, merges it into the symbol/timeframe TanStack Query cache, and preserves the visible time range. Live pages use interval-aware shared-cache windows; closed historical pages are cached for one hour.
- Source documentation: [Binance public market-only endpoints](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md), [Binance WebSocket streams](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md).
- Alternatives reachable during this review: [Kraken order book](https://docs-legacy.kraken.com/api/docs/websocket-v2/book/) and [Coinbase channels](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels). No automatic provider switching: do not silently merge liquidity models.

Depth messages are complete top-20 snapshots, not incremental deltas. Execution pauses if disconnected or the latest snapshot is over four seconds old. Binance candle keys are case sensitive (`t/T`, `l/L`, `v/V`); an explicit decoder and regression test preserve that distinction. The reconnect path bootstraps recent candles again.

Prices are integer cents; coin quantities are integer millionths; USDT balances/ledger use 1e-8 units. Initial virtual balance: 10,000 USDT; no free coins. Fees are 10 basis points, rounded down to quote atoms per fill. Market orders have a 1% protection bound and cancel unfilled remainder. Limit orders can partially sweep eligible displayed depth immediately; resting orders only fill after an observed aggressor trade **strictly through** the limit, with observed volume caps. A touch is insufficient. Capacity is consumed per account and observation. Comparisons intentionally have independent per-account capacity.

Go persists a receipt atomically before replying. Java persists the pending receipt key before sending, settles under a database transaction, and acknowledges only after commit. Canceled pending commands resolve to the saved fill or a durable empty receipt before releasing reserves. A crash of the Go process itself can delay cancellation until it is back; no balance is released against an unresolved fill. Cancellation inside a mission-control transaction may retain an acknowledged-equivalent receipt until cleanup; this favors correctness over reclaiming that small record immediately.

This is an approximation of execution, not Binance queue simulation. Missing trades during reconnects or beyond the recent-trade buffer can underfill resting orders. It does not model hidden liquidity, queue priority, order impact, exchange lot-size rules or slippage beyond observed levels/protection. No order is sent outside AlgoTy.

## Identity and isolation

Guest access can be upgraded in place to name/email/password. PBKDF2-HMAC-SHA256 uses a unique salt and 160,000 iterations. Raw session secrets are never persisted in the database; hashed sessions expire after seven days. The browser receives an HttpOnly, Secure-on-HTTPS, SameSite=Strict cookie. Login, recovery and registration are throttled; nginx also limits session creation and auth routes.

A private recovery code is issued once at registration. Recovery requires that code, rotates it and invalidates all old sessions. No email reset or email ownership verification is offered. Losing both password and recovery code requires operator support; do not imply email delivery exists. The public share token is intentionally distinct from a session token and must never replace the session cookie.

Every portfolio/order/mission mutation checks ownership. Manual order requests cannot select an agent account. Public comparison responses include only the selected plans, sampled curves and fills. Publishing requires an explicit click. Session data, recovery codes, private briefs and other portfolios are omitted.

## Agent model

Supported symbols: BTC/ETH/SOL against USDT. Timeframes: 1m, 5m. Strategies: range breakout, SMA trend and RSI mean reversion. Long-only spot; one position per agent. Plans display allocation, position budget, lookback, volume threshold, confirming bars, daily entry cap, stop/target and duration. Unsupported needs remain unresolved questions until reviewed; no arbitrary user code executes.

The worker evaluates new completed bars after activation. Five-minute bars require all five completed one-minute candles. Deterministic rules generate candidates. AI may veto an entry and explains its decision using supplied evidence. Exits are deterministic and do not wait for the LLM. Missing/invalid AI review skips the entry. Stops and targets are evaluated on candle close, not continuously or at guaranteed prices. A pause/stop cancels open orders but leaves existing holdings intact.

Java separately enforces ownership, active state, one position, available funds, per-entry/position bounds, pending orders and UTC daily entry counts. Drafts do not trade. Rule changes after activation produce a new draft version. Comparison branches receive fresh equal accounts; the original mission is unchanged. Both branches start in one transaction. Later pauses or different durations can reduce comparability. Equity samples are 15 seconds apart; long series are thinned for display. Drawdown shown by the UI is based on displayed observations, not tick-level extrema.

Limits: four active missions per user; ten successful drafts per hour; ten AI planning/control attempts per five minutes per user; two concurrent LLM calls; default global 200 LLM calls per UTC day, saved in `.runtime/ai-budget.json`. Planning/review limits are deliberately conservative for this preview. Maximum mission duration 168 hours. Twenty open manual orders and 2,000 total orders per account. The guest population has a 2,000-account bound. These are resource bounds, not a load-test result.

## Run and verify

```bash
# Java, bounded build (no Next build on yusam)
cd services/core-java
./gradlew bootJar --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx512m
cd ../market-go
go test -race ./...
go build -o market .
cd ../..
python3 -m unittest discover -s workers/mission-python -p test_service.py -v
bash infra/start.sh
```

Private runtime config: `.runtime/database.env`, `.runtime/ai.env`. Startup generates absent random database/internal credentials. AI uses `OPENROUTER_API_KEY` or the private `AI_KEY_FILE`; the current installation reads the configured magents `.env` key only. No secrets should be copied into source, screenshots or reports. `MISSION_MODEL` defaults to `openai/gpt-4.1-mini`; `MISSION_DAILY_AI_CALLS` changes the provider-call budget. Follow-up deployment: rebuild changed Java/Go only, then `bash infra/start-v2.sh`; Next preview reflects source changes. Save the PM2 process list after a verified change.

```bash
python3 tests/v2-api.py       # Creates QA-only virtual account; real small LLM calls
python3 tests/v2-runtime.py   # Requires API fixture; restarts only Java/Go services
node tests/v2-browser.cjs    # Full UI flow; creates QA-only virtual account
node tests/loading.cjs       # Cold loader + brand cache; no trade data cached
```

Runtime test restarts are disruptive to the preview and should be run in an appropriate window. Test accounts use `example.invalid`. Their private fixture is excluded from evidence. Stop test missions after verification. Do not delete real user data while cleaning tests.

## UI

Art direction: warm ivory, charcoal, restrained orange and muted market colors. Two GPT-image-generated directions were compared in `design/concepts.png`. Layouts are implemented in code, not screenshot facsimiles. The original animated silver coin, A-facing initial reveal, first-load cover and six cached brand assets are preserved. Reduced-motion disables decorative motion. API responses, market data and session data are not service-worker cached.

Routes: `/`, `/markets`, `/trade`, `/agents`, `/account`, `/shared/:token`. The four private product routes share one persistent route-group layout and TanStack Query client. User data is keyed by user id, retained in memory for background refreshes and explicitly invalidated after mutations; changing accounts drops the previous user's queries. Live SSE snapshots use the same cache while streams remain live. Market/timeframe/tab/draft choices use the route-group view store and browser-session storage. None of these responses are written to the service-worker cache.

The exchange has zoomable candles, switchable logarithmic/linear price scales, optional SMA, depth-price selection, execution detail, positions, assets and ledger. The selected price scale persists with the other browser-session chart controls. Mobile layouts preserve the order ticket and book. Missions have editable plans, an evidence journal, natural-language control previews and read-only comparison publishing.
