# Architecture decisions

Java is a modular monolith, not separate account/ledger/risk services. Next.js calls Java. Go is the sole matching authority for a market. Python runs asynchronous research tasks.

## Financial invariants

- Represent prices and quantities with fixed-point integers or explicit decimal types; never binary floating point for financial accounting.
- Every ledger transaction balances; available funds cannot become negative.
- Java reserves funds before an order can reach Go.
- Persist an order and its outbox command in one database transaction.
- Assign stable command IDs and per-market sequence numbers. Duplicate commands must not execute twice.
- Matching requires durable sequencing/journaling and replay before acknowledging accepted commands. Define the exact persistence protocol before implementation.
- Java consumes execution events idempotently, with a unique event ID and settlement in one database transaction.
- Cancel acknowledgments release only the remaining reservation; a cancel request alone does not release funds.
- Initially use one active matcher per market. Do not claim high availability or exactly-once transport.

## Demo boundaries

Initial liquidity comes from explicit simulated counterparties. Historical candles cannot reconstruct historical order-book queues. Later replay must document liquidity, latency, fee and slippage assumptions.

AI explanations must reference computed results; model text is not an accounting authority.

## Implemented persistence choice

Version 0.1 uses an atomic full-state snapshot (temp file, fsync, rename, directory fsync) for every new Go command. A recovered snapshot includes both the resting book and prior command results. Java retries a lost response, then settles and marks the outbox row done atomically. This prioritizes auditability over throughput; it is not the proposed future append-only journal.

The demo's financial asset label is USD (virtual), with research separately using public BTCUSDT candles. Live exchange execution and historical order-book reconstruction are not implemented.
