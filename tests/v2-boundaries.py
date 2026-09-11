import json, urllib.request, urllib.error, uuid, concurrent.futures, pathlib, subprocess, time

base = "http://127.0.0.1:18201/api/v2/"


def call(path, b=None, token="", headers={}):
    r = urllib.request.Request(
        base + path,
        data=json.dumps(b).encode() if b is not None else None,
        headers={"Content-Type": "application/json", "X-Session": token, **headers},
    )
    try:
        with urllib.request.urlopen(r, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


_, g = call("session", {})
t = g["token"]
key = uuid.uuid4().hex
b = {
    "symbol": "BTCUSDT",
    "kind": "LIMIT",
    "side": "BUY",
    "price": 600000,
    "quantity": 1000000,
}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    responses = list(
        pool.map(lambda i: call("orders", {**b, "key": key + str(i)}, t), range(2))
    )
assert sorted(x[0] for x in responses) == [200, 400], responses
order = next(x[1] for x in responses if x[0] == 200)
assert call("orders/" + order["id"] + "/cancel", {}, t)[0] == 200
_, p = call("portfolio", token=t)
assert all(x["reserved"] == 0 and x["total"] >= 0 for x in p["balances"])
assert p["balanced"]
# Reconcile balances independently from the ledger for all v2 accounts.
sql = "SELECT count(*) FROM v2_balances b WHERE b.total<>COALESCE((SELECT sum(l.amount) FROM v2_ledger l WHERE l.account_id=b.account_id AND l.asset=b.asset AND l.owner='account'),0);"
result = subprocess.check_output(
    [
        "docker",
        "exec",
        "exchange-lab-postgres",
        "psql",
        "-U",
        "exchange",
        "-d",
        "exchange",
        "-Atc",
        sql,
    ],
    text=True,
).strip()
assert result == "0", result
# Auth throttling is checked under its own test key.
statuses = [
    call(
        "login",
        {"email": "nobody@example.invalid", "password": "not-a-real-password"},
        headers={"X-Client-IP": "rate-" + key},
    )
    for _ in range(11)
]
assert "Too many attempts" in statuses[-1][1]["error"]
# Public frontend must block internal routes and cross-site mutations.
for path, status, origin in [
    ("internal/work", 404, None),
    ("orders", 403, "https://outside.invalid"),
]:
    r = urllib.request.Request(
        "http://127.0.0.1:18200/api/v2/" + path,
        data=b"{}" if origin else None,
        headers={
            "Content-Type": "application/json",
            **({"Origin": origin} if origin else {}),
        },
    )
    try:
        urllib.request.urlopen(r)
        raise AssertionError("should reject")
    except urllib.error.HTTPError as e:
        assert e.code == status, (path, e.code)
checks = [
    "concurrent reservations cannot overspend",
    "all account totals independently match their ledger entries",
    "login attempt throttling",
    "worker endpoints not exposed through web proxy",
    "cross-origin POST rejection",
]
pathlib.Path("docs/v2/evidence/boundaries.json").write_text(
    json.dumps(checks, indent=2)
)
print(json.dumps(checks, indent=2))
