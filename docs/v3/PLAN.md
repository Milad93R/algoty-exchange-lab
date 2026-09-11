# Mission Studio — implementation checklist

Source of truth: bounded, versioned rule trees. The visible flow, live evaluation and historical replay consume the same definition. No arbitrary code execution, external exchange orders, news/on-chain sources, leverage or claims of universal strategy support.

- [x] Versioned composable rules with validation, bounded complexity and legacy compatibility.
- [x] Price/volume, SMA/EMA/RSI/ATR/range/volume-ratio operands; cross-market and 1m/5m/15m/1h context.
- [x] AND/OR/NOT, comparisons/crossings, consecutive confirmations, ordered events and UTC schedules.
- [x] Risk: fixed/trailing exits, partial exits, scale-in cap, cooldown and daily loss cap; Java enforces allocation and order limits.
- [x] AI creates/edits exact definitions; unsupported requests remain questions, never silent substitution.
- [x] Editable visual rule tree with node inspection, live true/false/wait evidence and execution receipts.
- [x] Historical replay uses identical evaluator, next-bar execution, costs, benchmark, equity, drawdown and inspectable decisions.
- [x] Studio UI: editorial hierarchy, distinctive graph canvas, responsive panels, purposeful motion and reduced-motion support.
- [x] Import/export definitions, composable starter templates and immutable active versions.
- [x] Engine, API ownership/bounds, live integration and desktop/mobile browser tests.
- [x] Deploy changed services; verify public site; record evidence and limitations.

Arbitrary isolated Python and user-supplied data connectors are separate future capabilities, not represented as implemented. Historical fills are a candle-based model, distinct from live book-based paper fills. Replay does not forecast returns.

Verified 2026-09-08. Evidence: `evidence/python-tests.txt` (16 tests), `java-build.txt`, `api.json`, `live.json`, `browser.json`, `public.json`, `instructions.json`, `health.json`. See README for exact semantics and replay/live differences.
