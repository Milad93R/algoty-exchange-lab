import { cookies } from "next/headers";
export async function POST(req) {
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "Cross-site request rejected" },
      { status: 403 },
    );
  const store = await cookies();
  const old = store.get("exchange-session")?.value;
  if (old) {
    const check = await fetch("http://127.0.0.1:18201/api/state", {
      headers: { "X-Session": old },
      cache: "no-store",
    });
    if (check.ok) return Response.json({ ready: true });
  }
  const r = await fetch("http://127.0.0.1:18201/api/session", {
    method: "POST",
  });
  if (!r.ok)
    return Response.json(
      { error: "Session initialization failed" },
      { status: 503 },
    );
  const d = await r.json();
  store.set("exchange-session", d.session, {
    httpOnly: true,
    secure: req.headers.get("x-forwarded-proto") === "https",
    sameSite: "strict",
    path: "/",
    maxAge: 86400 * 7,
  });
  return Response.json({ ready: true });
}
