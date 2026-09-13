# AlgoTy

**Live markets. Your own next move.**

A live-data paper exchange with a Go execution engine, Java financial core and AI mission agents. Follow BTC, ETH and SOL, place orders with virtual funds, or turn a brief into an agent with explicit rules and a decision journal.

[Open AlgoTy](https://algoty.com) · [Exchange](https://algoty.com/trade) · [AI missions](https://algoty.com/agents)

## What it does

- Streams real Binance spot depth and trades, and opens each chart with up to 1,000 cached Binance candles for 1m, 5m, 15m, 30m, 1h, 4h, 1d and 1w. Dragging into the past loads and merges older pages on demand.
- Renders interactive volume, crosshair, SMA and switchable logarithmic/linear price scales.
- Executes market, limit and linked OCO paper orders against observed liquidity, including partial fills, single-reservation OCO legs, fees and cancellation.
- Keeps accounts, positions, realized/unrealized P&L and a balanced double-entry ledger in PostgreSQL.
- Converts an AI brief into an editable draft. Activation, risk limits and account authorization are enforced outside the model.
- Evaluates closed candles in the background; records evidence, AI entry reviews and paper fills.
- Supports pause/resume/stop, versioned changes and natural-language control previews.
- Starts two fresh agent versions with equal capital and a common start; optionally publishes a read-only comparison.
- Provides a responsive exchange workstation, an animated landing and account access across devices.

No order leaves AlgoTy. No real deposits, withdrawals, leverage or return guarantees.

## Architecture

| Component | Code | Owns |
|---|---|---|
| Java / Spring Boot | `services/core-java` | Identity, authorization, financial transactions, lifecycle, persistence |
| Go | `services/market-go` | Market feed, capacity-aware execution, durable idempotent receipts |
| Python | `workers/mission-python` | LLM planning/control, signal evaluation and entry review |
| Next.js | `apps/web` | Product UI, cookie session boundary, restricted API proxy, SSE |

The ledger and orders use integer monetary units. Go persists results before replying; Java acknowledges after settlement commits. Retried commands cannot consume the same result twice. Current snapshot/trade capacity is retained independently of receipt cleanup.

## Try a mission

1. Open the exchange for a 10,000 virtual USDT account.
2. Open AI missions and describe the market, entry idea and limits.
3. Review the generated plan. Resolve questions and activate explicitly.
4. Watch the decision journal as new candles close. No qualifying signal means no trade.
5. Explore a second path to compare two fresh versions, then publish only if you want a public link.

Supported entry families are range breakout, SMA trend and RSI mean reversion on 1m/5m candles. Stops are checked at candle close. Execution is an observed-liquidity model, not an exact model of Binance queue position or market impact. Agent accounts consume liquidity independently for comparison.

## Development and validation

See the [runbook](docs/v2/RUNBOOK.md) for lifecycle commands, environment configuration, precision, execution assumptions and limits. See the [implementation checklist](docs/v2/PLAN.md) and [verification evidence](docs/v2/evidence).

```sh
(cd services/market-go && go test -race ./... && go build -o market .)
(cd services/core-java && ./gradlew bootJar --no-daemon --max-workers=2 -Dorg.gradle.jvmargs=-Xmx512m)
python3 -m unittest discover -s workers/mission-python -p test_service.py -v
bash infra/start.sh
```

This deployment is a **public preview**. Server policy prohibits full Next builds/typechecks on yusam, so `infra/build-web.sh` builds the Next.js app on a separate build machine over SSH and installs the production output here; pm2 then runs `next start`. Internal navigation is client-side, and the brand cover only runs on a cold load. Product routes share a persistent TanStack Query client: portfolio, mission, account and live-market snapshots remain visible while freshness checks run in the background; view choices are retained for the browser session. Java and Go are compiled services. Tests cover unit/domain rules, real API/LLM flows, restart recovery and desktop/mobile journeys; these are not claims of exchange-scale throughput or profitable trading.

Older simulated matching and historical research sources remain available under `services/matching-go`, `workers/research-python` and earlier docs as a development baseline. The v2 product uses the live-market path above. Secrets and runtime snapshots are excluded from Git.
