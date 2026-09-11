# Protocol v0.1

Browser requests use `/api/*`; Next.js supplies the opaque session to Java. Internal Java clients use `X-Session`.

- `POST /api/session` creates a session internally; browser proxy reuses its existing cookie.
- `GET /api/state` returns balances, last 100 user orders/trades/ledger rows, active book levels, pending count and ledger balance check.
- `POST /api/orders`: `{"side":"BUY","price":6010000,"quantity":10,"key":"unique-request-key"}`. Price is cents; quantity is milli-BTC. Same key/payload returns same order; conflicting payload returns 400. Acceptance is durable, not a fill acknowledgment.
- `POST /api/cancel/{id}` requests cancellation; reservation release waits for the matching response.
- `GET /api/research` (web only) returns the completed research artifact.
- `GET /health` on both internal services.
- `GET /metrics` on both internal services exposes basic Prometheus counters/gauges. Not exposed by the browser proxy.

Java atomically inserts the order, reservation and outbox command. Go receives `POST /command` with an ID, kind (`place`/`cancel`), and order (id/book/owner/side/price/remaining). It durably stores the command and result before responding. Results include execution IDs, maker prices and quantities. Java persists trades, ledger entries, order changes and outbox completion in one transaction.

UI updates poll every 1.5 seconds. No WebSocket transport claim in this version.
