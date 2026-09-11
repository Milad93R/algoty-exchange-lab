"""Versioned, bounded rule interpreter. Same semantics for studio, replay and live."""

import math
from datetime import datetime, timezone

SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")
TF = {"1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000}
# Indicator library. Each kind lists its extra numeric parameters and the history it needs.
PRICE = ("open", "high", "low", "close", "volume", "hl2", "typical")
PERIOD_KINDS = (
    "sma", "ema", "wma", "rsi", "atr", "adx", "cci", "williamsR", "highest", "lowest",
    "volumeRatio", "volumeSma", "vwap", "change", "swingHigh", "swingLow",
)
MACD_KINDS = ("macd", "macdSignal", "macdHist")
BB_KINDS = ("bbUpper", "bbMiddle", "bbLower", "bbWidth", "bbPercent")
STOCH_KINDS = ("stochK", "stochD")
BAR_KINDS = ("bodyPct", "rangePct", "vwapSession")
KINDS = PRICE + PERIOD_KINDS + MACD_KINDS + BB_KINDS + STOCH_KINDS + BAR_KINDS
PARAMS = {
    **{k: () for k in PRICE + BAR_KINDS},
    **{k: ("period",) for k in PERIOD_KINDS},
    **{k: ("fast", "slow", "signal") for k in MACD_KINDS},
    **{k: ("period", "mult") for k in BB_KINDS},
    **{k: ("period", "smooth") for k in STOCH_KINDS},
}
DEFAULTS = {"period": 14, "fast": 12, "slow": 26, "signal": 9, "mult": 2, "smooth": 3}
OPS = ("gt", "gte", "lt", "lte", "crossAbove", "crossBelow")
PATTERNS = (
    "bullishEngulfing", "bearishEngulfing", "hammer", "shootingStar", "doji",
    "insideBar", "outsideBar", "threeWhiteSoldiers", "threeBlackCrows",
    "morningStar", "eveningStar", "higherHigh", "lowerLow", "higherLow", "lowerHigh",
)
SWING_PATTERNS = ("higherHigh", "lowerLow", "higherLow", "lowerHigh")
import library, patterns, smc

KINDS = KINDS + library.EXTRA_KINDS
PARAMS.update(library.EXTRA_PARAMS)
DEFAULTS.update(library.EXTRA_DEFAULTS)
PATTERNS = PATTERNS + patterns.EXTRA_PATTERNS + smc.SMC_PATTERNS
MOD_FUNCTIONS = ("average", "max", "min", "stdev", "direction", "sign", "lookback")
MOD_AVERAGES = ("sma", "ema", "hma")
FORMULA_NAMES = {"a", "b", "open", "high", "low", "close", "volume"}
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

    def operand(v, depth=0):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            number(v, -1e9, 1e9)
            return
        kind = v.get("kind") if isinstance(v, dict) else None
        if kind == "mod":
            if depth >= 2 or set(v) - {"kind", "fn", "of", "length", "ma"}:
                raise ValueError("Unsupported modifier")
            if v.get("fn") not in MOD_FUNCTIONS or v.get("ma", "sma") not in MOD_AVERAGES:
                raise ValueError("Unknown modifier function")
            number(v.get("length"), 1 if v["fn"] == "lookback" else 2, 50, True)
            operand(v.get("of"), depth + 1)
            return
        if kind not in KINDS or set(v) - ({"kind", "timeframe", "symbol", "offset"} | set(PARAMS[kind])):
            raise ValueError("Unknown indicator or parameter")
        context(v)
        for p in PARAMS[kind]:
            if p == "session":
                if v.get("session", DEFAULTS["session"]) not in library.SESSIONS:
                    raise ValueError("Unknown session")
                continue
            lo, hi, integer = library.NUMERIC_RANGES.get(p, {"mult": (0.5, 5, False)}.get(p, (2, 200, True)))
            number(v.get(p, DEFAULTS[p]), lo, hi, integer)
        if kind in MACD_KINDS and v.get("fast", 12) >= v.get("slow", 26):
            raise ValueError("MACD fast period must be shorter than slow")
        if kind in ("superTrend", "superTrendDir", "psar", "psarDir") and v.get("step", 0.02) > v.get("maxStep", 0.2):
            raise ValueError("Parabolic step must not exceed the maximum")

    def context(v):
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
        elif op == "pattern":
            allowed |= {"name", "symbol", "timeframe", "offset", "period", "mult", "source"}
            if n.get("name") not in PATTERNS:
                raise ValueError("Unknown candle pattern")
            context({k: n[k] for k in ("symbol", "timeframe", "offset") if k in n})
            number(n.get("period", 5), 2, 50, True)
            number(n.get("mult", 1.5), 0.5, 5, False)
            if n.get("source", "rsi") not in patterns.SOURCES:
                raise ValueError("Unknown divergence source")
        elif op == "formula":
            allowed |= {"left", "right", "expr"}
            operand(n.get("left"))
            operand(n.get("right"))
            compile_formula(n.get("expr"))
        elif op in ("rising", "falling"):
            allowed |= {"left", "bars"}
            operand(n.get("left"))
            number(n.get("bars"), 1, 10, True)
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
    def operand_cost(v):
        if isinstance(v, dict) and v.get("kind") == "mod":
            return (1 if v["fn"] == "lookback" else v["length"]) * operand_cost(v["of"])
        return 1

    def cost(n):
        op = n["op"]
        children = n.get("children", [n["child"]] if "child" in n else [])
        operands = sum(operand_cost(n[k]) for k in ("left", "right") if k in n)
        return (
            n.get("within", 1)
            if op == "sequence"
            else n.get("bars", 1) if op in ("consecutive", "rising", "falling") else 1
        ) * (1 + operands + sum(cost(c) for c in children))

    if cost(flow["entry"]) + cost(flow["exit"]) > 800:
        raise ValueError("Temporal rule budget exceeded")
    return flow


def _sma(xs, n):
    return sum(xs[-n:]) / n


def _ema_series(xs, n):
    """EMA seeded with the first-period mean, then standard 2/(n+1) smoothing."""
    if len(xs) < n:
        return []
    out = [sum(xs[:n]) / n]
    k = 2 / (n + 1)
    for x in xs[n:]:
        out.append(out[-1] + (x - out[-1]) * k)
    return out


def _wilder(xs, n):
    """Wilder smoothing: first value is the simple mean, then (prev*(n-1)+x)/n."""
    if len(xs) < n:
        return []
    out = [sum(xs[:n]) / n]
    for x in xs[n:]:
        out.append((out[-1] * (n - 1) + x) / n)
    return out


def _true_ranges(rs):
    return [
        max(rs[i]["high"] - rs[i]["low"], abs(rs[i]["high"] - rs[i - 1]["close"]), abs(rs[i]["low"] - rs[i - 1]["close"]))
        for i in range(1, len(rs))
    ]


def _pivots(rs, n, high=True):
    """Confirmed swing points: extreme of the 2n+1 window, strictly beyond the left side."""
    key = "high" if high else "low"
    out = []
    for i in range(n, len(rs) - n):
        x = rs[i][key]
        left = [r[key] for r in rs[i - n : i]]
        right = [r[key] for r in rs[i + 1 : i + n + 1]]
        if high and x > max(left) and x >= max(right):
            out.append((rs[i]["time"], x))
        if not high and x < min(left) and x <= min(right):
            out.append((rs[i]["time"], x))
    return out


def _stoch_k(rs, n):
    return [
        100 * (rs[i]["close"] - min(r["low"] for r in rs[i - n + 1 : i + 1]))
        / ((max(r["high"] for r in rs[i - n + 1 : i + 1]) - min(r["low"] for r in rs[i - n + 1 : i + 1])) or float("nan"))
        for i in range(n - 1, len(rs))
    ]


def _core_indicator(kind, rs, p):
    """Value of `kind` on closed candles `rs` (latest last). None while history is insufficient."""
    n = p.get("period", 14)
    closes = [r["close"] for r in rs]
    last = rs[-1]
    if kind in ("open", "high", "low", "close", "volume"):
        return last[kind]
    if kind == "hl2":
        return (last["high"] + last["low"]) / 2
    if kind == "typical":
        return (last["high"] + last["low"] + last["close"]) / 3
    if kind == "bodyPct":
        return (last["close"] - last["open"]) / last["open"] * 100 if last["open"] else None
    if kind == "rangePct":
        return (last["high"] - last["low"]) / last["open"] * 100 if last["open"] else None
    if kind == "vwapSession":
        day = last["time"] // 86400000
        rows = [r for r in rs if r["time"] // 86400000 == day]
        vol = sum(r["volume"] for r in rows)
        return sum((r["high"] + r["low"] + r["close"]) / 3 * r["volume"] for r in rows) / vol if vol else None
    if kind in MACD_KINDS:
        fast, slow, signal = p["fast"], p["slow"], p["signal"]
        ef, es = _ema_series(closes, fast), _ema_series(closes, slow)
        if not es:
            return None
        line = [a - b for a, b in zip(ef[len(ef) - len(es) :], es)]
        if kind == "macd":
            return line[-1]
        sig = _ema_series(line, signal)
        if not sig:
            return None
        return sig[-1] if kind == "macdSignal" else line[-1] - sig[-1]
    if kind in BB_KINDS:
        if len(rs) < n:
            return None
        window = closes[-n:]
        mid = sum(window) / n
        sd = (sum((x - mid) ** 2 for x in window) / n) ** 0.5
        upper, lower = mid + p["mult"] * sd, mid - p["mult"] * sd
        return {
            "bbUpper": upper, "bbMiddle": mid, "bbLower": lower,
            "bbWidth": (upper - lower) / mid * 100 if mid else None,
            "bbPercent": (last["close"] - lower) / (upper - lower) * 100 if upper > lower else None,
        }[kind]
    if kind in STOCH_KINDS:
        need = n + (p["smooth"] - 1 if kind == "stochD" else 0)
        if len(rs) < need:
            return None
        ks = _stoch_k(rs, n)
        if kind == "stochK":
            return None if ks[-1] != ks[-1] else ks[-1]
        window = ks[-p["smooth"] :]
        return None if any(x != x for x in window) else sum(window) / len(window)
    if kind in ("swingHigh", "swingLow"):
        pv = _pivots(rs, n, kind == "swingHigh")
        return pv[-1][1] if pv else None
    if kind == "change":
        return (closes[-1] / closes[-1 - n] - 1) * 100 if len(closes) > n and closes[-1 - n] else None
    if kind in ("rsi", "atr", "adx", "volumeRatio"):
        if len(rs) < n + 1:
            return None
    elif len(rs) < n:
        return None
    if kind == "sma":
        return _sma(closes, n)
    if kind == "ema":
        return _ema_series(closes, n)[-1]
    if kind == "wma":
        return sum(x * (i + 1) for i, x in enumerate(closes[-n:])) / (n * (n + 1) / 2)
    if kind == "highest":
        return max(r["high"] for r in rs[-n:])
    if kind == "lowest":
        return min(r["low"] for r in rs[-n:])
    if kind == "volumeSma":
        return sum(r["volume"] for r in rs[-n:]) / n
    if kind == "volumeRatio":
        avg = sum(r["volume"] for r in rs[-n - 1 : -1]) / n
        return last["volume"] / avg if avg else None
    if kind == "vwap":
        vol = sum(r["volume"] for r in rs[-n:])
        return sum((r["high"] + r["low"] + r["close"]) / 3 * r["volume"] for r in rs[-n:]) / vol if vol else None
    if kind == "rsi":
        ds = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        up = _wilder([max(d, 0) for d in ds], n)[-1]
        down = _wilder([max(-d, 0) for d in ds], n)[-1]
        return 100 - 100 / (1 + up / down) if down else 100.0
    if kind == "atr":
        return _wilder(_true_ranges(rs), n)[-1]
    if kind == "adx":
        if len(rs) < 2 * n:
            return None
        plus, minus = [], []
        for i in range(1, len(rs)):
            up = rs[i]["high"] - rs[i - 1]["high"]
            dn = rs[i - 1]["low"] - rs[i]["low"]
            plus.append(up if up > dn and up > 0 else 0.0)
            minus.append(dn if dn > up and dn > 0 else 0.0)
        tr = _wilder(_true_ranges(rs), n)
        sp, sm = _wilder(plus, n), _wilder(minus, n)
        dx = []
        for t, a, b in zip(tr, sp, sm):
            di_p, di_m = (100 * a / t, 100 * b / t) if t else (0.0, 0.0)
            dx.append(100 * abs(di_p - di_m) / (di_p + di_m) if di_p + di_m else 0.0)
        w = _wilder(dx, n)
        return w[-1] if w else None
    if kind == "cci":
        tps = [(r["high"] + r["low"] + r["close"]) / 3 for r in rs[-n:]]
        mean = sum(tps) / n
        dev = sum(abs(x - mean) for x in tps) / n
        return (tps[-1] - mean) / (0.015 * dev) if dev else 0.0
    if kind == "williamsR":
        hh = max(r["high"] for r in rs[-n:])
        ll = min(r["low"] for r in rs[-n:])
        return (hh - last["close"]) / (hh - ll) * -100 if hh > ll else None
    return None


def indicator(kind, rs, p):
    if kind in library.EXTRA_KINDS:
        return library.extra_indicator(kind, rs, p)
    return _core_indicator(kind, rs, p)


def pattern(name, rs, n=5, p=None):
    """Candle pattern on closed candles `rs`; None while history is insufficient. Returns (bool, details)."""
    p = p or {}
    if name in smc.SMC_PATTERNS:
        return smc.smc_pattern(name, rs, n, p.get("mult", 1.5))
    if name in patterns.EXTRA_PATTERNS:
        return patterns.extra_pattern(name, rs, n, p)
    need = 3 if name in ("threeWhiteSoldiers", "threeBlackCrows", "morningStar", "eveningStar") else 1 if name in ("doji", "hammer", "shootingStar") else 2
    if name in SWING_PATTERNS:
        pv = _pivots(rs, n, name in ("higherHigh", "lowerHigh"))
        if len(pv) < 2:
            return None, {"swings": len(pv)}
        (_, a), (_, b) = pv[-2], pv[-1]
        value = b > a if name in ("higherHigh", "higherLow") else b < a
        return value, {"previousSwing": a, "latestSwing": b}
    if len(rs) < need:
        return None, {}
    c = rs[-need:]
    body = lambda r: abs(r["close"] - r["open"])
    rng = lambda r: r["high"] - r["low"]
    bull = lambda r: r["close"] > r["open"]
    bear = lambda r: r["close"] < r["open"]
    upper = lambda r: r["high"] - max(r["open"], r["close"])
    lower = lambda r: min(r["open"], r["close"]) - r["low"]
    prev, last = c[-2] if len(c) > 1 else None, c[-1]
    details = {"open": last["open"], "high": last["high"], "low": last["low"], "close": last["close"]}
    if name == "doji":
        value = rng(last) > 0 and body(last) <= 0.1 * rng(last)
    elif name == "hammer":
        value = body(last) > 0 and lower(last) >= 2 * body(last) and upper(last) <= body(last)
    elif name == "shootingStar":
        value = body(last) > 0 and upper(last) >= 2 * body(last) and lower(last) <= body(last)
    elif name == "bullishEngulfing":
        value = bear(prev) and bull(last) and last["open"] <= prev["close"] and last["close"] >= prev["open"] and body(last) > body(prev)
    elif name == "bearishEngulfing":
        value = bull(prev) and bear(last) and last["open"] >= prev["close"] and last["close"] <= prev["open"] and body(last) > body(prev)
    elif name == "insideBar":
        value = last["high"] < prev["high"] and last["low"] > prev["low"]
    elif name == "outsideBar":
        value = last["high"] > prev["high"] and last["low"] < prev["low"]
    elif name in ("threeWhiteSoldiers", "threeBlackCrows"):
        up = name == "threeWhiteSoldiers"
        value = all(
            (bull(r) if up else bear(r)) and rng(r) > 0 and body(r) >= 0.5 * rng(r)
            for r in c
        ) and all(
            ((c[i]["close"] > c[i - 1]["close"] and c[i - 1]["open"] <= c[i]["open"] <= c[i - 1]["close"]) if up
             else (c[i]["close"] < c[i - 1]["close"] and c[i - 1]["close"] <= c[i]["open"] <= c[i - 1]["open"]))
            for i in (1, 2)
        )
    elif name in ("morningStar", "eveningStar"):
        first, star, third = c
        mid = (first["open"] + first["close"]) / 2
        if name == "morningStar":
            value = bear(first) and body(star) < 0.5 * body(first) and bull(third) and third["close"] > mid
        else:
            value = bull(first) and body(star) < 0.5 * body(first) and bear(third) and third["close"] < mid
    else:
        value = None
    return (None if value is None else bool(value)), details


import ast as _ast

_FORMULA_OPS = (_ast.Add, _ast.Sub, _ast.Mult, _ast.Div, _ast.Pow, _ast.USub, _ast.UAdd, _ast.Mod)
_FORMULA_CMP = (_ast.Gt, _ast.GtE, _ast.Lt, _ast.LtE, _ast.Eq, _ast.NotEq)
_FORMULA_FUNCS = {"abs": abs, "min": min, "max": max}


def compile_formula(expr):
    """Custom comparison such as `a/b > 1.5` over a, b, open, high, low, close, volume. Whitelisted AST only."""
    if not isinstance(expr, str) or not 1 <= len(expr) <= 200:
        raise ValueError("Formula must be short text")
    try:
        tree = _ast.parse(expr, mode="eval")
    except SyntaxError:
        raise ValueError("Formula could not be parsed")
    comparisons = 0
    for node in _ast.walk(tree):
        if isinstance(node, (_ast.Expression, _ast.Constant, _ast.BinOp, _ast.UnaryOp, _ast.BoolOp, _ast.And, _ast.Or, _ast.Load)):
            if isinstance(node, _ast.Constant) and not isinstance(node.value, (int, float)):
                raise ValueError("Formula constants must be numbers")
            continue
        if isinstance(node, _ast.Compare):
            comparisons += 1
            continue
        if isinstance(node, _FORMULA_OPS + _FORMULA_CMP):
            continue
        if isinstance(node, _ast.Name) and node.id in FORMULA_NAMES:
            continue
        if isinstance(node, _ast.Call) and isinstance(node.func, _ast.Name) and node.func.id in _FORMULA_FUNCS and not node.keywords:
            continue
        raise ValueError("Formula uses an unsupported element")
    if not comparisons:
        raise ValueError("Formula must compare values (for example a/b > 1.5)")
    return compile(tree, "<formula>", "eval")


def run_formula(expr, env):
    try:
        return bool(eval(compile_formula(expr), {"__builtins__": {}, **_FORMULA_FUNCS}, env))
    except (ZeroDivisionError, OverflowError, ValueError):
        return None


class Evaluator:
    def __init__(self, plan, contexts, at):
        self.plan = plan
        self.contexts = contexts
        self.at = at
        self.trace = {}
        self.cache = {}

    def rows(self, v, at):
        """Closed candles of the operand's context up to `at`, minus `offset` bars."""
        symbol = v.get("symbol", self.plan["symbol"])
        tf = v.get("timeframe", self.plan["timeframe"])
        key = (symbol, tf, at, v.get("offset", 0))
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
        self.cache[key] = rs
        return rs

    def value(self, v, at):
        if isinstance(v, (float, int)):
            return v
        kind = v["kind"]
        if kind == "mod":
            return self.modifier(v, at)
        p = {k: v.get(k, 20 if k == "period" and kind in BB_KINDS else DEFAULTS[k]) for k in PARAMS[kind]}
        key = (v.get("symbol", self.plan["symbol"]), v.get("timeframe", self.plan["timeframe"]), at, kind, v.get("offset", 0), tuple(sorted(p.items())))
        if key in self.cache:
            return self.cache[key]
        rs = self.rows(v, at)
        result = indicator(kind, rs, p) if rs else None
        self.cache[key] = result
        return result

    def modifier(self, v, at):
        import json, statistics

        key = ("mod", json.dumps(v, sort_keys=True), at)
        if key in self.cache:
            return self.cache[key]
        inner = v["of"]
        tf = inner.get("timeframe", self.plan["timeframe"]) if isinstance(inner, dict) and inner.get("kind") != "mod" else self.plan["timeframe"]
        step = TF[tf]
        fn, n = v["fn"], v["length"]
        if fn == "lookback":
            result = self.value(inner, at - n * step)
        else:
            vals = [self.value(inner, at - i * step) for i in range(n)][::-1]  # oldest first
            if any(x is None for x in vals):
                result = None
            elif fn == "average":
                ma = v.get("ma", "sma")
                result = sum(vals) / n if ma == "sma" else _ema_series(vals, n)[-1] if ma == "ema" else (library.hma_series(vals, n) or [None])[-1]
            elif fn == "max":
                result = max(vals)
            elif fn == "min":
                result = min(vals)
            elif fn == "stdev":
                result = statistics.pstdev(vals)
            elif fn == "direction":
                result = 1 if all(vals[i] > vals[i - 1] for i in range(1, n)) else -1 if all(vals[i] < vals[i - 1] for i in range(1, n)) else 0
            else:  # sign
                result = 1 if all(x > 0 for x in vals) else -1 if all(x < 0 for x in vals) else 0
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
        elif op == "pattern":
            rs = self.rows(n, at)
            value, details = pattern(n["name"], rs, n.get("period", 5), n) if rs else (None, {})
            details = {"pattern": n["name"], **details}
        elif op == "formula":
            l = self.value(n["left"], at)
            r = self.value(n["right"], at)
            bar = self.rows({}, at)
            details = {"left": l, "right": r, "expr": n["expr"]}
            if l is None or r is None or not bar:
                value = None
            else:
                b = bar[-1]
                value = run_formula(n["expr"], {"a": l, "b": r, "open": b["open"], "high": b["high"], "low": b["low"], "close": b["close"], "volume": b["volume"]})
        elif op in ("rising", "falling"):
            vals = [self.value(n["left"], at - i * step) for i in range(n["bars"] + 1)]
            details = {"values": vals[::-1]}
            if any(x is None for x in vals):
                value = None
            else:
                value = all((vals[i] > vals[i + 1]) if op == "rising" else (vals[i] < vals[i + 1]) for i in range(n["bars"]))
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
