import json, urllib.request, urllib.error, time, uuid, pathlib, subprocess

qa = json.loads(pathlib.Path(".runtime/v2-qa.json").read_text())
token = qa["token"]
base = "http://127.0.0.1:18201/api/v2/"


def req(path, b=None):
    r = urllib.request.Request(
        base + path,
        data=json.dumps(b).encode() if b is not None else None,
        headers={"Content-Type": "application/json", "X-Session": token},
    )
    return json.load(urllib.request.urlopen(r, timeout=60))


original = req("portfolio")
order = req(
    "orders",
    {
        "symbol": "BTCUSDT",
        "side": "BUY",
        "kind": "LIMIT",
        "price": 100,
        "quantity": 1000,
        "key": "restart-" + uuid.uuid4().hex,
    },
)
time.sleep(1)
subprocess.run(
    ["pm2", "restart", "exchange-lab-core", "exchange-live-market"],
    stdout=subprocess.DEVNULL,
    check=True,
)
for _ in range(40):
    try:
        after = req("portfolio")
        break
    except Exception:
        time.sleep(1)
assert after["account"]["id"] == original["account"]["id"] and after["balanced"]
assert any(o["id"] == order["id"] for o in after["orders"])
for _ in range(30):
    try:
        req("orders/" + order["id"] + "/cancel", {})
        break
    except Exception:
        time.sleep(1)
assert all(b["reserved"] == 0 for b in req("portfolio")["balances"])
# Reuse a fresh draft; no simulated signals are injected into the live runner.
ms = req("missions")
source = next(m for m in ms if not m["group_id"])
draft = req("missions/" + source["id"] + "/edit", source["plan"])
mid = draft["id"]
req("missions/" + mid + "/control", {"action": "activate"})
seen = None
for _ in range(45):
    d = req("missions/" + mid)
    seen = next(
        (e for e in d["events"] if e["kind"] in ["WAIT", "ORDER", "BLOCKED"]), None
    )
    if seen:
        break
    time.sleep(2)
req("missions/" + mid + "/control", {"action": "stop"})
assert seen, "Background worker did not evaluate a new closed candle"
evidence = {
    "restart": "Same account, ledger and open order survived Java/Go restart; canceled afterward",
    "worker": {
        "kind": seen["kind"],
        "message": seen["message"],
        "evidence": json.loads(seen["evidence"]),
    },
}
pathlib.Path("docs/v2/evidence/runtime.json").write_text(json.dumps(evidence, indent=2))
print(json.dumps(evidence, indent=2))
