export const dynamic = "force-dynamic";
export async function GET(req) {
  const symbol = new URL(req.url).searchParams.get("symbol") || "BTCUSDT";
  if (!["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol))
    return Response.json({ error: "Unknown market" }, { status: 400 });
  if (new URL(req.url).searchParams.get("snapshot") === "1") {
    try {
      const r = await fetch("http://127.0.0.1:18203/market?symbol=" + symbol, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      return Response.json(await r.json(), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json(
        { stale: true, error: "Feed reconnecting" },
        { status: 503 },
      );
    }
  }
  let timer,
    closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      async function poll() {
        if (closed) return;
        try {
          const r = await fetch(
            "http://127.0.0.1:18203/market?symbol=" + symbol,
            { cache: "no-store", signal: AbortSignal.timeout(2500) },
          );
          const d = await r.json();
          d.trades = d.trades?.slice(-30);
          if (!closed)
            controller.enqueue(
              encoder.encode("data: " + JSON.stringify(d) + "\n\n"),
            );
        } catch {
          if (!closed)
            controller.enqueue(
              encoder.encode(
                'data: {"stale":true,"error":"Feed reconnecting"}\n\n',
              ),
            );
        }
        if (!closed) timer = setTimeout(poll, 1000);
      }
      poll();
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      closed = true;
      clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
