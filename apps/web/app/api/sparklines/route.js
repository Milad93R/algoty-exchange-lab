export const dynamic = "force-dynamic";
// Tiny payload for the landing page: recent closes per market from the live feed. Cached for a minute.
let cache = { at: 0, body: null };
export async function GET() {
  if (Date.now() - cache.at < 60000 && cache.body)
    return Response.json(cache.body, { headers: { "Cache-Control": "no-store" } });
  const out = {};
  await Promise.all(
    ["BTCUSDT", "ETHUSDT", "SOLUSDT"].map(async (symbol) => {
      try {
        const r = await fetch("http://127.0.0.1:18203/market?symbol=" + symbol, {
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        const d = await r.json();
        const candles = (d.candles || []).slice(-300);
        const step = Math.max(1, Math.floor(candles.length / 60));
        out[symbol] = {
          closes: candles.filter((_, i) => i % step === 0 || i === candles.length - 1).map((c) => c.close),
          minutes: candles.length,
        };
      } catch {
        out[symbol] = { closes: [], minutes: 0 };
      }
    }),
  );
  cache = { at: Date.now(), body: { updatedAt: new Date().toISOString(), markets: out } };
  return Response.json(cache.body, { headers: { "Cache-Control": "no-store" } });
}
