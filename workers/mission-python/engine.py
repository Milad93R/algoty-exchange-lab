"""Versioned, bounded rule interpreter. Same semantics for studio, replay and live."""

import math
from datetime import datetime, timezone

SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")
TF = {"1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000}
KINDS = (
    "close",
    "open",
    "high",
    "low",
    "volume",
    "sma",
    "ema",
    "rsi",
    "atr",
    "highest",
    "lowest",
    "volumeRatio",
)
OPS = ("gt", "gte", "lt", "lte", "crossAbove", "crossBelow")
DEFAULT_RISK = dict(
    maxEntries=1, exitPercent=100, trailingPct=0, cooldownBars=0, dailyLossPct=5
)


def number(x, lo, hi, integer=False):
    if (
        isinstance(x, bool)
        or not isinstance(x, (int, float))
        or not math.isfinite(x)
        or not lo <= x <= hi
        or integer
        and int(x) != x
    ):
        raise ValueError("Invalid numeric rule parameter")


def validate(flow):
    if (
        not isinstance(flow, dict)
        or (type(flow.get("version")) is not int or flow.get("version") != 1)
        or set(flow) - {"version", "entry", "exit", "risk"}
    ):
        raise ValueError("Unsupported flow version or fields")
    ids = set()
    count = 0

    def operand(v):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            number(v, -1e9, 1e9)
            return
        if (
            not isinstance(v, dict)
            or set(v) - {"kind", "period", "timeframe", "symbol", "offset"}
            or v.get("kind") not in KINDS
        ):
            raise ValueError("Unknown indicator")
        number(v.get("period", 14), 2, 200, True)
        number(v.get("offset", 0), 0, 50, True)
        if (
            v.get("symbol", SYMBOLS[0]) not in SYMBOLS
            or v.get("timeframe", "1m") not in TF
        ):
            raise ValueError("Unsupported indicator context")

    def node(n, depth=0):
        nonlocal count
        count += 1
        if count > 40 or depth > 6 or not isinstance(n, dict):
            raise ValueError("Flow too complex (40 nodes / 6 levels)")
        ident = n.get("id")
        op = n.get("op")
        if (
            not isinstance(ident, str)
            or not ident.isascii()
            or not ident.replace("_", "").replace("-", "").isalnum()
            or not 1 <= len(ident) <= 50
            or ident in ids
        ):
            raise ValueError("Unique short node IDs required")
        ids.add(ident)
        allowed = {"id", "op"}
        if op in ("all", "any", "sequence"):
            allowed |= {"children"}
            cs = n.get("children")
            if not isinstance(cs, list) or not 1 <= len(cs) <= 8:
                raise ValueError("Use 1–8 child rules")
            for c in cs:
                node(c, depth + 1)
            if op == "sequence":
                allowed.add("within")
                number(n.get("within"), 2, 30, True)
        elif op in ("not", "consecutive"):
            allowed.add("child")
            node(n.get("child"), depth + 1)
            if op == "consecutive":
                allowed.add("bars")
                number(n.get("bars"), 1, 10, True)
        elif op == "schedule":
            allowed |= {"startHour", "endHour"}
            number(n.get("startHour"), 0, 23, True)
            number(n.get("endHour"), 0, 24, True)
        elif op in OPS:
            allowed |= {"left", "right"}
            operand(n.get("left"))
            operand(n.get("right"))
        else:
            raise ValueError("Unsupported rule operator")
        if set(n) - allowed:
            raise ValueError("Unknown rule fields")

    node(flow.get("entry"))
    node(flow.get("exit"))
    risk = flow.get("risk", {})
    if not isinstance(risk, dict) or set(risk) - set(DEFAULT_RISK):
        raise ValueError("Unsupported risk setting")
    for k, lo, hi, integer in [
        ("maxEntries", 1, 5, True),
        ("exitPercent", 1, 100, False),
        ("trailingPct", 0, 20, False),
        ("cooldownBars", 0, 100, True),
        ("dailyLossPct", 0.1, 50, False),
    ]:
        number(risk.get(k, DEFAULT_RISK[k]), lo, hi, integer)

    # Limit temporal fan-out, preventing nested history operators from exponential evaluation.
    def cost(n):
        op = n["op"]
        children = n.get("children", [n["child"]] if "child" in n else [])
        return (
            n.get("within", 1)
            if op == "sequence"
            else n.get("bars", 1) if op == "consecutive" else 1
        ) * (1 + sum(cost(c) for c in children))

    if cost(flow["entry"]) + cost(flow["exit"]) > 500:
        raise ValueError("Temporal rule budget exceeded")
    return flow


class Evaluator:
    def __init__(self, plan, contexts, at):
        self.plan = plan
        self.contexts = contexts
        self.at = at
        self.trace = {}
        self.cache = {}

    def value(self, v, at):
        if isinstance(v, (float, int)):
            return v
        symbol = v.get("symbol", self.plan["symbol"])
        tf = v.get("timeframe", self.plan["timeframe"])
        key = (symbol, tf, at, v["kind"], v.get("period", 14), v.get("offset", 0))
        if key in self.cache:
            return self.cache[key]
        rs = [
            r
            for r in self.contexts.get(symbol + ":" + tf, [])
            if r.get("closed", True) and r["time"] + TF[tf] - 1 <= at
        ]
        offset = v.get("offset", 0)
        if offset:
            rs = rs[:-offset] if len(rs) > offset else []
        kind = v["kind"]
        n = v.get("period", 14)
        result = None
        if rs:
            closes = [r["close"] for r in rs]
            if kind in ("open", "high", "low", "close", "volume"):
                result = rs[-1][kind]
            elif len(rs) >= n + (kind in ("atr", "rsi", "volumeRatio")):
                if kind == "sma":
                    result = sum(closes[-n:]) / n
                elif kind == "ema":
                    result = sum(closes[:n]) / n
                    for c in closes[n:]:
                        result += (c - result) * 2 / (n + 1)
                elif kind == "highest":
                    result = max(r["high"] for r in rs[-n:])
                elif kind == "lowest":
                    result = min(r["low"] for r in rs[-n:])
                elif kind == "volumeRatio":
                    avg = sum(r["volume"] for r in rs[-n - 1 : -1]) / n
                    result = rs[-1]["volume"] / avg if avg else None
                elif kind == "rsi":
                    ds = [
                        closes[i] - closes[i - 1] for i in range(len(rs) - n, len(rs))
                    ]
                    up = sum(max(d, 0) for d in ds)
                    down = sum(max(-d, 0) for d in ds)
                    result = 100 - 100 / (1 + up / down) if down else 100 if up else 50
                elif kind == "atr":
                    result = (
                        sum(
                            max(
                                rs[i]["high"] - rs[i]["low"],
                                abs(rs[i]["high"] - closes[i - 1]),
                                abs(rs[i]["low"] - closes[i - 1]),
                            )
                            for i in range(len(rs) - n, len(rs))
                        )
                        / n
                    )
        self.cache[key] = result
        return result

    def node(self, n, at=None, record=True):
        at = self.at if at is None else at
        op = n["op"]
        details = {}
        step = TF[self.plan["timeframe"]]
        if op in ("all", "any"):
            results = [self.node(c, at, record) for c in n["children"]]
            value = (
                (False if False in results else None if None in results else True)
                if op == "all"
                else (True if True in results else None if None in results else False)
            )
        elif op == "not":
            v = self.node(n["child"], at, record)
            value = None if v is None else not v
        elif op == "consecutive":
            results = [
                self.node(n["child"], at - i * step, record and i == 0)
                for i in range(n["bars"])
            ]
            value = False if False in results else None if None in results else True
            details = {"bars": n["bars"], "results": results}
        elif op == "sequence":
            # Ordered, strictly earlier matches; final event must occur on current bar.
            last = self.node(n["children"][-1], at, record)
            cursor = at - step
            value = last
            for c in reversed(n["children"][:-1]):
                found = False
                unknown = False
                while cursor >= at - (n["within"] - 1) * step:
                    v = self.node(c, cursor, False)
                    cursor -= step
                    if v is True:
                        found = True
                        break
                    if v is None:
                        unknown = True
                self.node(c, at, record)
                if not found:
                    value = None if unknown and value is not False else False
                    break
            details = {"withinBars": n["within"]}
        elif op == "schedule":
            h = datetime.fromtimestamp(at / 1000, timezone.utc).hour
            a = n["startHour"]
            b = n["endHour"]
            value = (a <= h < b) if a < b else (h >= a or h < b) if a > b else True
            details = {"hourUTC": h, "start": a, "end": b}
        else:
            l = self.value(n["left"], at)
            r = self.value(n["right"], at)
            details = {"left": l, "right": r}
            if l is None or r is None:
                value = None
            elif op == "gt":
                value = l > r
            elif op == "gte":
                value = l >= r
            elif op == "lt":
                value = l < r
            elif op == "lte":
                value = l <= r
            else:
                pl = self.value(n["left"], at - step)
                pr = self.value(n["right"], at - step)
                details.update(previousLeft=pl, previousRight=pr)
                value = (
                    None
                    if pl is None or pr is None
                    else (
                        pl <= pr and l > r if op == "crossAbove" else pl >= pr and l < r
                    )
                )
        if record:
            self.trace[n["id"]] = {
                "status": "waiting" if value is None else "pass" if value else "fail",
                **details,
            }
        return value


def evaluate(plan, contexts, portfolio, at):
    flow = validate(plan["flow"])
    e = Evaluator(plan, contexts, at)
    entry = e.node(flow["entry"])
    exit = e.node(flow["exit"])
    risk = {**DEFAULT_RISK, **flow.get("risk", {})}
    position = next(
        (x for x in portfolio.get("positions", []) if x["symbol"] == plan["symbol"]), {}
    )
    asset = plan["symbol"].replace("USDT", "")
    holding = next(
        (x["total"] for x in portfolio.get("balances", []) if x["asset"] == asset), 0
    )
    fills = sorted(
        [x for x in portfolio.get("fills", []) if x["symbol"] == plan["symbol"]],
        key=lambda f: str(f.get("created_at", "")),
    )

    def stamp(f):
        v = f.get("created_at", 0)
        return (
            int(datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp() * 1000)
            if isinstance(v, str)
            else v
        )

    close = e.value({"kind": "close"}, at)
    evidence = {
        "trace": e.trace,
        "barTime": at,
        "close": close,
        "flowVersion": 1,
        "exitPercent": risk["exitPercent"],
        "nextState": {"peak": 0},
    }
    if close is None:
        return "WAIT", "Waiting for closed market data", evidence
    lastfill = max((stamp(f) for f in fills), default=0)
    if holding and position.get("entryPrice", 0) > 0:
        change = (close / position["entryPrice"] - 1) * 100
        inventory = 0
        opened = at
        for f in fills:
            if f["side"] == "BUY" and inventory <= 0:
                opened = stamp(f)
            inventory += f.get("quantity", 0) * (1 if f["side"] == "BUY" else -1)
        if not fills:
            opened = at
        rows = [
            r
            for r in contexts[plan["symbol"] + ":" + plan["timeframe"]]
            if opened <= r["time"] + TF[plan["timeframe"]] - 1 <= at
        ]
        peak = max(
            [position["entryPrice"], portfolio.get("_flowState", {}).get("peak", 0)]
            + [r["close"] for r in rows]
        )
        evidence["nextState"] = {"peak": peak}
        trailing = risk["trailingPct"] > 0 and close <= peak * (
            1 - risk["trailingPct"] / 100
        )
        evidence.update(positionChangePct=change, trailingPeak=peak)
        if (
            change <= -plan["stopLossPct"]
            or (plan["takeProfitPct"] > 0 and change >= plan["takeProfitPct"])
            or trailing
        ):
            evidence["exitPercent"] = 100
            evidence["protectiveExit"] = True
            return "SELL", "Protective closed-bar exit", evidence
        if exit is True:
            return "SELL", "Exit flow satisfied", evidence
    if at - lastfill < risk["cooldownBars"] * TF[plan["timeframe"]]:
        return "WAIT", "Cooldown is active", evidence
    if holding and risk["maxEntries"] == 1:
        return "WAIT", "Position open; waiting for exit", evidence
    if entry is True:
        return "BUY", "Entry flow satisfied", evidence
    return "WAIT", "Entry flow is waiting for confirmation", evidence
