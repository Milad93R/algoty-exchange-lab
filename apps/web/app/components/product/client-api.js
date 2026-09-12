export async function api(path, body) {
  const r = await fetch("/api/v2/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  let d;
  try {
    d = await r.json();
  } catch {
    throw Error(
      r.status === 429
        ? "Too many requests. Wait a moment and try again."
        : "Connection unavailable. Please retry shortly.",
    );
  }
  if (!r.ok) throw Error(d.error || d.message || "Request failed");
  return d;
}
