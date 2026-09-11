import { cookies } from "next/headers";
export const dynamic = "force-dynamic";
async function forward(req, { params }) {
  const { path } = await params;
  const route = path.join("/");
  if (
    !/^(account\/(?:profile|password|forgot|reset|email-code|email|sessions|sessions\/revoke)|session|me|email-code|register|login|recover|logout|portfolio|orders|orders\/[a-zA-Z0-9-]+\/cancel|missions|missions\/manual|missions\/[a-zA-Z0-9-]+(?:\/(?:edit|control|instruction|branch|replay|scan))?|comparisons\/[a-zA-Z0-9-]+\/(?:start|share)|shared\/[a-zA-Z0-9_-]+)$/.test(
      route,
    )
  )
    return Response.json({ error: "Not found" }, { status: 404 });
  if (req.method === "POST") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (
      req.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && new URL(origin).host !== host)
    )
      return Response.json(
        { error: "Cross-site request rejected" },
        { status: 403 },
      );
  }
  const store = await cookies();
  const session = store.get("algoty-session")?.value || "";
  let body;
  if (req.method === "POST") {
    body = await req.text();
    if (body.length > 12000)
      return Response.json({ error: "Request too large" }, { status: 413 });
  }
  const q = new URL(req.url).searchParams;
  const account = q.get("account");
  if (account && !/^[a-zA-Z0-9-]{1,80}$/.test(account))
    return Response.json({ error: "Invalid account" }, { status: 400 });
  try {
    const r = await fetch(
      "http://127.0.0.1:18201/api/v2/" +
        route +
        (account ? "?account=" + account : ""),
      {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          "X-Session": session,
          "X-Client-IP": req.headers.get("x-real-ip") || "local",
        },
        ...(body ? { body } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(55000),
      },
    );
    const data = await r.json();
    if (
      data.token &&
      ["session", "register", "login", "recover", "account/password", "account/reset", "account/email"].includes(route)
    ) {
      store.set("algoty-session", data.token, {
        httpOnly: true,
        secure: req.headers.get("x-forwarded-proto") === "https",
        sameSite: "strict",
        path: "/",
        maxAge: 604800,
      });
      delete data.token;
    }
    if (route === "logout") store.delete("algoty-session");
    return Response.json(data, {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Connection unavailable. Your saved work is safe; try again shortly.",
      },
      { status: 503 },
    );
  }
}
export { forward as GET, forward as POST };
