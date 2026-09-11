# Delivery status — 2026-09-07

Completed v0.1:
- Protocol and integer precision documented.
- Go matching with priority, partial fills, cancellation and durable snapshots.
- Java virtual accounts, reservations, ledger and PostgreSQL transactional outbox.
- Integration tests for duplicates, overspend, concurrent reservation and isolated sessions.
- Fault test: matcher persisted result before Java settlement; both restart; single settlement verified.
- Next.js terminal with order book, orders, ledger and responsive browser checks locally and on the public domain.
- Reproducible 80-order smoke benchmark plus idle process memory snapshot; results in verification.json.
- Python fixed-parameter backtest using public BTCUSDT candles, costs, independent holdout slice, evidence-linked LLM commentary and equity playback.

The milestone-one acceptance gate passed: place/partially fill/cancel, restart, redeliver and reconcile without duplicate settlement.

Still separate production work, not claimed complete:
- Production Next artifact built on a suitable machine (full Next builds forbidden on yusam).
- Append-only journal/checkpoints instead of full snapshots; partitioning instead of a global Java lock when benchmark evidence justifies it.
- Coordinated automated backups, retention, account recovery and stronger operational authentication.
- Realistic historical liquidity replay through the matcher; current research simulator is explicitly separate.
- Distributed tracing, HA/failover and broader fault/load campaigns.
- Formal evaluation set for AI claims beyond evidence-path validation and manual review of the displayed run.

No resumes or employer applications were sent.
