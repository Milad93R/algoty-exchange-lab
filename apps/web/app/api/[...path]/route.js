import { cookies } from "next/headers";
async function forward(req, { params }) {
  if (
    req.method === "POST" &&
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json(
      { error: "Cross-site request rejected" },
      { status: 403 },
    );
  const { path } = await params;
  const route = path.join("/");
  if (!/^(state|orders|cancel\/[a-zA-Z0-9-]+|research)$/.test(route))
    return Response.json({ error: "Not found" }, { status: 404 });
  const session = (await cookies()).get("exchange-session")?.value;
  if (!session)
    return Response.json({ error: "Start a session first" }, { status: 401 });
  if (route === "research") {
    const fs = await import("node:fs/promises");
    try {
      return Response.json(
        JSON.parse(
          await fs.readFile(
            process.env.RESEARCH_REPORT ||
              "/home/milad/projects/self/algoty-exchange-lab/workers/research-python/report.json",
            "utf8",
          ),
        ),
      );
    } catch {
      return Response.json({ status: "not_run" });
    }
  }
  try {
    const r = await fetch("http://127.0.0.1:18201/api/" + route, {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-Session": session },
      ...(req.method === "POST" ? { body: await req.text() } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Core unavailable. Accepted orders remain stored; retry with the same request key.",
      },
      { status: 503 },
    );
  }
}
export { forward as GET, forward as POST };
