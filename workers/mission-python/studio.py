"""Historical market context and transparent next-open replay."""

import time, threading, json, urllib.request, hashlib
import engine

cache = {}
lock = threading.Lock()


def context_keys(plan):
    keys = {(plan["symbol"], plan["timeframe"])}

    def walk(x):
        if isinstance(x, dict):
            if "kind" in x:
                keys.add(
                    (
                        x.get("symbol", plan["symbol"]),
                        x.get("timeframe", plan["timeframe"]),
                    )
                )
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(plan.get("flow", {}))
    return keys


def contexts(plan):
    out = {}
    for symbol, tf in sorted(context_keys(plan)):
        key = symbol + ":" + tf
        with lock:
            hit = cache.get(key)
        if hit and time.time() - hit[0] < 20:
            out[key] = hit[1]
            continue
        url = f"https://data-api.binance.vision/api/v3/klines?symbol={symbol}&interval={tf}&limit=500"
        with urllib.request.urlopen(url, timeout=8) as r:
            data = json.load(r)
        now = int(time.time() * 1000)
        rows = [
            dict(
                time=x[0],
                open=float(x[1]),
                high=float(x[2]),
                low=float(x[3]),
                close=float(x[4]),
                volume=float(x[5]),
                closed=x[6] < now,
            )
            for x in data
            if x[6] < now
        ]
        if not rows or now - (rows[-1]["time"] + engine.TF[tf]) > engine.TF[tf] + 20000:
            raise ValueError("Historical feed is stale")
        with lock:
            cache[key] = (time.time(), rows)
        out[key] = rows
    return out


def replay(plan, ctx, slippageBps=5):
    engine.number(slippageBps, 0, 100)
    rows = ctx[plan["symbol"] + ":" + plan["timeframe"]]
    # 220-bar warmup, bounded latest history. No current-close fills.
    if len(rows) < 250:
        raise ValueError("At least 250 complete candles required")
    cash = 10000.0
    qty = 0.0
    cost = 0.0
    peak = 10000.0
    dd = 0.0
    fees = 0.0
    events = []
    curve = []
    fills = []
    entries = 0
    day = None
    daystart = 10000.0
    risk = {**engine.DEFAULT_RISK, **plan["flow"].get("risk", {})}
    for i in range(220, len(rows) - 1):
        bar = rows[i]["time"] + engine.TF[plan["timeframe"]] - 1
        if bar // 86400000 != day:
            day = bar // 86400000
            daily = 0
            daystart = cash + qty * rows[i]["close"]
        portfolio = {
            "balances": [
                {"asset": plan["symbol"].replace("USDT", ""), "total": round(qty * 1e6)}
            ],
            "positions": [
                {"symbol": plan["symbol"], "entryPrice": cost / qty if qty else 0}
            ],
            "fills": fills,
        }
        action, message, evidence = engine.evaluate(plan, ctx, portfolio, bar)
        equity = cash + qty * rows[i]["close"]
        if action == "BUY" and (
            daily >= plan["dailyTrades"]
            or entries >= risk["maxEntries"]
            or equity <= daystart * (1 - risk["dailyLossPct"] / 100)
        ):
            action = "WAIT"
            message = "Entry blocked by risk limits"
        price = rows[i + 1]["open"] * (
            1 + (slippageBps / 10000) * (1 if action == "BUY" else -1)
        )
        amount = 0.0
        if action == "BUY":
            budget = min(
                plan["orderQuote"], max(0, plan["maxPositionQuote"] - qty * price), cash
            )
            amount = int(budget / (price * 1.001) * 1e6) / 1e6
            if amount > 0:
                fee = amount * price * 0.001
                cash -= amount * price + fee
                cost += amount * price + fee
                qty += amount
                entries += 1
                daily += 1
        elif action == "SELL" and qty:
            amount = int(qty * evidence["exitPercent"] / 100 * 1e6) / 1e6
            if amount > 0:
                fee = amount * price * 0.001
                cash += amount * price - fee
                cost *= max(0, (qty - amount) / qty)
                qty -= amount
                if qty < 1e-6:
                    qty = 0
                    cost = 0
                    entries = 0
        if amount:
            fees += fee
            fills.append(
                {
                    "symbol": plan["symbol"],
                    "side": action,
                    "quantity": round(amount * 1e6),
                    "price": round(price * 100),
                    "fee": round(fee * 1e8),
                    "created_at": rows[i + 1]["time"],
                }
            )
        events.append(
            {
                "time": bar,
                "action": action if amount else "WAIT",
                "message": message,
                "trace": evidence["trace"],
                "fill": fills[-1] if amount else None,
            }
        )
        marked = cash + qty * rows[i + 1]["close"]
        peak = max(peak, marked)
        dd = max(dd, (peak - marked) / peak * 100)
        curve.append({"created_at": rows[i + 1]["time"], "equity": round(marked * 1e8)})
    benchmark = (
        10000
        / (rows[221]["open"] * (1 + slippageBps / 10000) * 1.001)
        * rows[-1]["close"]
    )
    return {
        "strategyHash": hashlib.sha256(
            json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "curve": curve,
        "events": events,
        "fees": fees,
        "returnPct": (marked / 10000 - 1) * 100,
        "drawdownPct": dd,
        "benchmarkReturnPct": (benchmark / 10000 - 1) * 100,
        "fills": len(fills),
        "start": rows[220]["time"],
        "end": rows[-1]["time"],
        "bars": len(events),
        "slippageBps": slippageBps,
        "model": "Next candle open, 0.1% fees each fill, configured slippage. Unliquidated holdings marked at close. No depth or queue model. Recent 500-candle window with 220 warmup bars.",
    }
