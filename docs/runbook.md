# Operations

## Start / stop

`./infra/start.sh` starts the dedicated PostgreSQL container and three exchange-lab PM2 processes. Database credentials live only under `.runtime`. Existing unrelated services are not touched.

```sh
pm2 stop exchange-lab-web exchange-lab-core exchange-lab-matching
docker stop exchange-lab-postgres
```

All persistent state survives process stop. Never delete the matcher snapshot independently of the database. Never restart the retired AlgoTy stack as part of recovery.

## Backup

Stop Java then Go to quiesce command processing. Dump `exchange` through `docker exec exchange-lab-postgres pg_dump -U exchange exchange`, and copy `.runtime/matching.json` into the same dated private backup. Restart Go then Java. Back up database credentials privately. Do not publish session IDs: they are bearer capabilities.

## Pending commands

When Go is unavailable, accepted orders remain PENDING with funds reserved. Restore the matcher and let Java retry. Do not manually clear reservations or mark an outbox row done. Repeated response loss is safe: the matcher returns its previously persisted result.

If the matcher snapshot is lost, stop order acceptance and restore a coordinated backup. Reinitializing an empty matcher against the existing database is not a recovery procedure.

## Current performance

A smoke run on the shared host processed 80 sequential requests and verified 80 trades with balanced accounting. See verification.json for numbers and scope. Full-snapshot persistence and the global Java lock are deliberate simplicity tradeoffs. Rebenchmark after changes; do not present the smoke test as production capacity.

## Frontend preview

The server forbids full Next/TypeScript builds. The current Next dev process is memory-limited and serves this preview. A production launch needs a production artifact built on a separate suitable build machine plus production-mode browser checks. Existing preview nginx configuration has body-size and request-rate limits.

## Retired application

The old frontend, AI service, user service, finance service and two MongoDB containers remain stopped. Source and volumes are preserved. The separate rashidikhah-resume container stays running.
