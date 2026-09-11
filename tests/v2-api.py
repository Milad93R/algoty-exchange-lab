import json, urllib.request, urllib.error, time, uuid, concurrent.futures, pathlib, os

BASE = "http://127.0.0.1:18201/api/v2/"
checks = []


def req(path, body=None, token="", status=200):
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Content-Type": "application/json",
            "X-Session": token,
            "X-Client-IP": "qa-" + RUN,
        },
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            code = x.status
            d = json.load(x)
    except urllib.error.HTTPError as e:
        code = e.code
        d = json.load(e)
    assert code == status, (path, code, d)
    return d


RUN = uuid.uuid4().hex
for _ in range(30):
    try:
        g = req("session", {})
        break
    except Exception:
        time.sleep(1)
t = g["token"]
uid = g["user"]["id"]
g2 = req("session", {})
t2 = g2["token"]
p = req("portfolio", token=t)
a = p["account"]["id"]
assert p["equity"] == 10**12 and p["balanced"]
checks.append("guest portfolio and double-entry funding")
req("portfolio?account=" + a, token=t2, status=400)
checks.append("cross-user portfolio isolation")
key = "test-" + RUN
b = {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "kind": "MARKET",
    "quantity": 1000,
    "price": 0,
    "key": key,
}
for _ in range(20):
    try:
        o = req("orders", b, t)
        break
    except AssertionError as e:
        if "stale" not in str(e):
            raise
        time.sleep(1)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    duplicates = list(pool.map(lambda _: req("orders", b, t), range(3)))
assert all(x["id"] == o["id"] for x in duplicates)
req("orders", {**b, "quantity": 1001}, t, status=400)
req("orders", {**b, "key": "decimal-" + RUN, "quantity": 1.5}, t, status=400)
for _ in range(20):
    p = req("portfolio", token=t)
    if p["orders"][0]["status"] == "FILLED":
        break
    time.sleep(0.7)
assert p["orders"][0]["status"] == "FILLED" and p["balanced"] and len(p["fills"]) >= 1
assert sum(x["quantity"] for x in p["fills"]) == 1000
assert p["positions"][0]["entryPrice"] > 0
checks.append("market fill, fees, positions, idempotency and fractional-unit rejection")
req(
    "orders",
    {**b, "key": "oversell-" + RUN, "side": "SELL", "quantity": 1000000},
    t,
    status=400,
)
req("orders", {**b, "key": "overbuy-" + RUN, "quantity": 1000000000}, t, status=400)
l = req(
    "orders",
    {**b, "key": "limit-" + RUN, "kind": "LIMIT", "price": 100, "quantity": 1000},
    t,
)
req("orders/" + l["id"] + "/cancel", {}, t2, status=400)
req("orders/" + l["id"] + "/cancel", {}, t)
p = req("portfolio", token=t)
assert p["orders"][0]["status"] == "CANCELED"
assert all(x["reserved"] == 0 for x in p["balances"])
checks.append("limit cancellation, no overspend/shorting and cancellation isolation")
email = "algoty-qa-" + RUN + "@example.invalid"
password = "Test-only-" + RUN
reg = req("register", {"name": "QA portfolio", "email": email, "password": password}, t)
t = reg["token"]
assert reg["user"]["id"] == uid
assert req("portfolio", token=t)["account"]["id"] == a
req("me", token=g["token"], status=400)
login = req("login", {"email": email, "password": password})
assert login["user"]["id"] == uid
new = req(
    "recover",
    {
        "email": email,
        "password": password + "-new",
        "recoveryCode": reg["recoveryCode"],
    },
)
t = new["token"]
req("me", token=login["token"], status=400)
req(
    "recover",
    {
        "email": email,
        "password": password + "-new",
        "recoveryCode": reg["recoveryCode"],
    },
    status=400,
)
checks.append(
    "guest upgrade, cross-browser login, one-time recovery rotation and old-session revocation"
)
# LLM request is deliberately real; unsupported fields must remain reviewable.
d = req(
    "missions",
    {
        "brief": "Watch BTC for a 1-minute range breakout. Use $100 per entry, 2% stop loss, 4% take profit, no volume filter, run for 1 hour."
    },
    t,
)
id = d["id"]
assert d["status"] == "DRAFT" and d["portfolio"]["orders"] == []
plan = d["plan"]
assert plan["symbol"] == "BTCUSDT"
req("missions/" + id, token=t2, status=400)
req("missions/" + id + "/edit", {**plan, "dailyTrades": 1.2}, t, status=400)
plan.update(questions=[], dailyTrades=3, durationHours=1)
req("missions/" + id + "/edit", plan, t)
req("missions/" + id + "/control", {"action": "activate"}, t)
req("missions/" + id + "/control", {"action": "pause"}, t)
proposal = req(
    "missions/" + id + "/instruction", {"instruction": "Resume this mission"}, t
)
assert proposal["action"] == "resume", proposal
assert req("missions/" + id, token=t)["status"] == "PAUSED"
req("missions/" + id + "/control", {"action": "resume"}, t)
req("missions/" + id + "/control", {"action": "stop"}, t)
req("missions/" + id + "/control", {"action": "pause"}, t, status=400)
req("missions/" + id + "/control", {"action": "resume"}, t, status=400)
version = req("missions/" + id + "/edit", plan, t)
assert version["version"] == 2 and version["status"] == "DRAFT" and version["id"] != id
checks.append(
    "real LLM draft, explicit activation, typed rule validation, proposal-only control, lifecycle and versioning"
)
comp = req(
    "missions/" + id + "/branch",
    {
        "brief": "Use two confirming candles instead of one. Keep everything else the same."
    },
    t,
)
assert len(comp["agents"]) == 2 and all(
    x["portfolio"]["equity"] == 10**12 and x["status"] == "DRAFT"
    for x in comp["agents"]
)
for x in comp["agents"]:
    if x["plan"]["questions"]:
        req("missions/" + x["id"] + "/edit", {**x["plan"], "questions": []}, t)
req("comparisons/" + comp["group"] + "/start", {}, t)
x, y = [req("missions/" + m["id"], token=t) for m in comp["agents"]]
assert x["started_at"] == y["started_at"]
link = req("comparisons/" + comp["group"] + "/share", {}, t)
pub = req("shared/" + link["token"])
assert len(pub["agents"]) == 2
serialized = json.dumps(pub)
assert all(
    k not in serialized for k in ["email", "recovery_hash", "user_id", "account_id"]
)
req("comparisons/" + comp["group"] + "/share", {}, t2, status=400)
for m in [x, y]:
    req("missions/" + m["id"] + "/control", {"action": "stop"}, t)
checks.append(
    "real LLM branching, equal-capital paired start, read-only published comparison and privacy boundaries"
)
# Credentials remain local and excluded from evidence.
os.umask(0o077)
pathlib.Path(".runtime/v2-qa.json").write_text(
    json.dumps(
        {
            "token": t,
            "uid": uid,
            "account": a,
            "mission": id,
            "comparison": comp["group"],
            "share": link["token"],
        }
    )
)
pathlib.Path("docs/v2/evidence/api.json").write_text(
    json.dumps(
        {"checks": checks, "passed": len(checks), "timestamp": time.time()}, indent=2
    )
)
print(json.dumps({"passed": checks}, indent=2))
