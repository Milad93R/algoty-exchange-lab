import json, time, urllib.error, urllib.request, uuid

BASE = "http://127.0.0.1:18201/api/v2/"


def req(path, body=None, token="", status=200):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Session": token},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            code, data = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        code, data = error.code, json.load(error)
    assert code == status, (path, code, data)
    return data


def market():
    for _ in range(40):
        with urllib.request.urlopen(
            "http://127.0.0.1:18203/market?symbol=BTCUSDT", timeout=10
        ) as response:
            data = json.load(response)
        if not data["stale"] and data["asks"] and data["bids"]:
            return data
        time.sleep(0.5)
    raise AssertionError("market feed did not become fresh")


token = req("session", {})["token"]
run = uuid.uuid4().hex
quote_before = req("portfolio", token=token)["balances"]
quote_before = next(x for x in quote_before if x["asset"] == "USDT")
m = market()
assert not m["stale"] and m["asks"] and m["bids"]
ask, bid = m["asks"][0]["price"], m["bids"][0]["price"]

# A BUY OCO reserves only its more expensive possible leg, not both legs.
buy = {
    "symbol": "BTCUSDT",
    "side": "BUY",
    "kind": "OCO",
    "price": bid * 90 // 100,
    "stopPrice": ask * 110 // 100,
    "stopLimitPrice": ask * 111 // 100,
    "quantity": 1000,
    "key": "oco-buy-" + run,
}
order = req("orders", buy, token)
duplicate = req("orders", buy, token)
assert duplicate["id"] == order["id"]
req("orders", {**buy, "stopPrice": buy["stopPrice"] + 1}, token, 400)
portfolio = req("portfolio", token=token)
row = next(x for x in portfolio["orders"] if x["id"] == order["id"])
assert row["kind"] == "OCO" and row["active_leg"] == ""
assert row["stop_price"] == buy["stopPrice"]
expected = buy["stopLimitPrice"] * buy["quantity"]
expected += expected // 1000
usdt = next(x for x in portfolio["balances"] if x["asset"] == "USDT")
assert usdt["reserved"] == expected, (usdt, expected)
assert usdt["reserved"] < (buy["price"] + buy["stopLimitPrice"]) * buy["quantity"]

# Invalid side/price geometry is rejected before any additional reservation.
req(
    "orders",
    {**buy, "key": "oco-invalid-" + run, "price": ask * 120 // 100},
    token,
    400,
)
req("orders/" + order["id"] + "/cancel", {}, token)
portfolio = req("portfolio", token=token)
row = next(x for x in portfolio["orders"] if x["id"] == order["id"])
usdt = next(x for x in portfolio["balances"] if x["asset"] == "USDT")
assert row["status"] == "CANCELED" and usdt["reserved"] == 0
assert usdt["total"] == quote_before["total"] and portfolio["balanced"]

# Existing market settlement still uses the migrated reserve-price path.
market_order = req(
    "orders",
    {
        "symbol": "BTCUSDT",
        "side": "BUY",
        "kind": "MARKET",
        "price": 0,
        "quantity": 100,
        "key": "market-regression-" + run,
    },
    token,
)
for _ in range(40):
    portfolio = req("portfolio", token=token)
    market_row = next(x for x in portfolio["orders"] if x["id"] == market_order["id"])
    if market_row["status"] == "FILLED":
        break
    time.sleep(0.5)
assert market_row["status"] == "FILLED" and portfolio["balanced"]
assert all(x["reserved"] >= 0 for x in portfolio["balances"])

# SELL OCO reserves one base quantity and releases it once on cancellation.
m = market()
bid = m["bids"][0]["price"]
sell = {
    "symbol": "BTCUSDT",
    "side": "SELL",
    "kind": "OCO",
    "price": bid * 110 // 100,
    "stopPrice": bid * 90 // 100,
    "stopLimitPrice": bid * 89 // 100,
    "quantity": 1,
    "key": "oco-sell-" + run,
}
sell_order = req("orders", sell, token)
portfolio = req("portfolio", token=token)
btc = next(x for x in portfolio["balances"] if x["asset"] == "BTC")
assert btc["reserved"] == 1
req("orders/" + sell_order["id"] + "/cancel", {}, token)
portfolio = req("portfolio", token=token)
btc = next(x for x in portfolio["balances"] if x["asset"] == "BTC")
assert btc["reserved"] == 0 and portfolio["balanced"]

print(
    json.dumps(
        {
            "passed": [
                "OCO request idempotency and mutation rejection",
                "one worst-case reservation for two linked buy legs",
                "invalid OCO geometry rejected",
                "parent cancellation releases reservation exactly once",
                "existing market-order settlement remains balanced",
                "sell OCO reserves one base quantity for both legs",
            ]
        },
        indent=2,
    )
)
