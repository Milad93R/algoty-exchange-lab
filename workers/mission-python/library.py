"""Extended numeric indicator library (Drakdoo parity). All functions take closed candles, latest last,
and return None while history is insufficient. Definitions follow common charting conventions."""

import math
from datetime import datetime, timezone

# kind -> parameter names. Numeric parameters are validated by engine.validate; string ones here.
EXTRA_PARAMS = {
    "hma": ("period",),
    "dema": ("period",),
    "keltnerUpper": ("period", "mult"),
    "keltnerMiddle": ("period", "mult"),
    "keltnerLower": ("period", "mult"),
    "tenkan": ("conversion", "base", "lagging", "displacement"),
    "kijun": ("conversion", "base", "lagging", "displacement"),
    "senkouA": ("conversion", "base", "lagging", "displacement"),
    "senkouB": ("conversion", "base", "lagging", "displacement"),
    "superTrend": ("period", "mult"),
    "superTrendDir": ("period", "mult"),
    "psar": ("step", "maxStep"),
    "psarDir": ("step", "maxStep"),
    "diPlus": ("period",),
    "diMinus": ("period",),
    "mfi": ("period",),
    "cmf": ("period",),
    "cmo": ("period",),
    "pgo": ("period",),
    "momentum": ("period",),
    "obv": (),
    "kdjK": ("period", "smooth"),
    "kdjD": ("period", "smooth"),
    "kdjJ": ("period", "smooth"),
    "tdSetup": (),
    "sslUp": ("period",),
    "sslDown": ("period",),
    "fibLevel": ("period", "level"),
    "supportLevel": ("period",),
    "resistanceLevel": ("period",),
    "rangePosition": ("period",),
    "structureTrend": ("period",),
    "obBullTop": ("period",),
    "obBullBottom": ("period",),
    "obBearTop": ("period",),
    "obBearBottom": ("period",),
    "fvgBullTop": (),
    "fvgBullBottom": (),
    "fvgBearTop": (),
    "fvgBearBottom": (),
    "sessionHigh": ("session",),
    "sessionLow": ("session",),
    "prevDayHigh": (),
    "prevDayLow": (),
    "prevDayClose": (),
    "dayOpen": (),
    "prevWeekHigh": (),
    "prevWeekLow": (),
}
EXTRA_DEFAULTS = {"conversion": 9, "base": 26, "lagging": 52, "displacement": 26, "step": 0.02, "maxStep": 0.2, "level": 0.618, "session": "london"}
NUMERIC_RANGES = {"conversion": (2, 200, True), "base": (2, 200, True), "lagging": (2, 200, True), "displacement": (0, 100, True), "step": (0.001, 0.2, False), "maxStep": (0.01, 1, False), "level": (0, 1, False)}
SESSIONS = {"asia": (0, 8), "london": (7, 16), "newyork": (12, 21)}  # UTC hours, start inclusive, end exclusive
EXTRA_KINDS = tuple(EXTRA_PARAMS)


def _h():
    import engine

    return engine


def _closes(rs):
    return [r["close"] for r in rs]


def _tp(r):
    return (r["high"] + r["low"] + r["close"]) / 3


def _wma_series(xs, n):
    w = n * (n + 1) / 2
    return [sum(x * (i + 1) for i, x in enumerate(xs[k - n + 1 : k + 1])) / w for k in range(n - 1, len(xs))]


def hma_series(xs, n):
    if len(xs) < n + int(math.sqrt(n)):
        return []
    half = _wma_series(xs, max(1, n // 2))
    full = _wma_series(xs, n)
    diff = [2 * a - b for a, b in zip(half[len(half) - len(full) :], full)]
    return _wma_series(diff, max(1, int(round(math.sqrt(n)))))


def ema_series(xs, n):
    return _h()._ema_series(xs, n)


def rsi_series(rs, n):
    """Wilder RSI for each bar from index n onwards (aligned to rs index by offset n)."""
    closes = _closes(rs)
    ds = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    ups = _h()._wilder([max(d, 0) for d in ds], n)
    downs = _h()._wilder([max(-d, 0) for d in ds], n)
    return [100 - 100 / (1 + u / d) if d else 100.0 for u, d in zip(ups, downs)]


def atr_series(rs, n):
    return _h()._wilder(_h()._true_ranges(rs), n)


def _dm(rs, n):
    plus, minus = [], []
    for i in range(1, len(rs)):
        up = rs[i]["high"] - rs[i - 1]["high"]
        dn = rs[i - 1]["low"] - rs[i]["low"]
        plus.append(up if up > dn and up > 0 else 0.0)
        minus.append(dn if dn > up and dn > 0 else 0.0)
    tr = atr_series(rs, n)
    sp, sm = _h()._wilder(plus, n), _h()._wilder(minus, n)
    return [(100 * a / t if t else 0.0, 100 * b / t if t else 0.0) for t, a, b in zip(tr, sp, sm)]


def supertrend(rs, n, mult):
    """Returns (value, direction) at the last bar; direction +1 bullish (price above), -1 bearish."""
    atr = atr_series(rs, n)
    if not atr:
        return None, None
    start = len(rs) - len(atr)
    upper = lower = None
    trend = 1
    value = None
    for k, a in enumerate(atr):
        r = rs[start + k]
        mid = (r["high"] + r["low"]) / 2
        up, dn = mid + mult * a, mid - mult * a
        prev_close = rs[start + k - 1]["close"] if start + k > 0 else r["close"]
        if lower is not None and (dn > lower or prev_close < lower):
            lower_band = dn
        else:
            lower_band = dn if lower is None else lower
        if upper is not None and (up < upper or prev_close > upper):
            upper_band = up
        else:
            upper_band = up if upper is None else upper
        if value is None:
            trend = 1 if r["close"] > up else -1
        elif trend == 1 and r["close"] < lower_band:
            trend = -1
        elif trend == -1 and r["close"] > upper_band:
            trend = 1
        upper, lower = upper_band, lower_band
        value = lower if trend == 1 else upper
    return value, trend


def psar(rs, step, max_step):
    if len(rs) < 5:
        return None, None
    bull = rs[1]["close"] > rs[0]["close"]
    sar = rs[0]["low"] if bull else rs[0]["high"]
    ep = rs[0]["high"] if bull else rs[0]["low"]
    af = step
    for i in range(1, len(rs)):
        r = rs[i]
        sar = sar + af * (ep - sar)
        if bull:
            sar = min(sar, rs[i - 1]["low"], rs[i - 2]["low"] if i > 1 else rs[i - 1]["low"])
            if r["low"] < sar:
                bull, sar, ep, af = False, ep, r["low"], step
            elif r["high"] > ep:
                ep, af = r["high"], min(max_step, af + step)
        else:
            sar = max(sar, rs[i - 1]["high"], rs[i - 2]["high"] if i > 1 else rs[i - 1]["high"])
            if r["high"] > sar:
                bull, sar, ep, af = True, ep, r["high"], step
            elif r["low"] < ep:
                ep, af = r["low"], min(max_step, af + step)
    return sar, 1 if bull else -1


def kdj(rs, n, smooth):
    ks = _h()._stoch_k(rs, n)
    if not ks or any(x != x for x in ks):
        ks = [50.0 if x != x else x for x in ks]
    if not ks:
        return None
    k = d = 50.0
    for raw in ks:
        k = (k * (smooth - 1) + raw) / smooth
        d = (d * (smooth - 1) + k) / smooth
    return k, d, 3 * k - 2 * d


def td_setup(rs):
    """TD Sequential setup count: +n for consecutive closes below close 4 bars earlier (buy setup), -n for above."""
    if len(rs) < 5:
        return None
    count = 0
    sign = 0
    for i in range(4, len(rs)):
        s = 1 if rs[i]["close"] < rs[i - 4]["close"] else -1 if rs[i]["close"] > rs[i - 4]["close"] else 0
        count = count + 1 if s and s == sign else (1 if s else 0)
        sign = s
    return sign * count


def levels(rs, n, atr_mult=0.5):
    """Support/resistance clusters from pivots: (supports, resistances) as lists of (level, touches)."""
    e = _h()
    atr = atr_series(rs, 14)
    tol = (atr[-1] if atr else (rs[-1]["high"] - rs[-1]["low"])) * atr_mult
    out = []
    for high in (True, False):
        pv = [x for _, x in e._pivots(rs, n, high)]
        clusters = []
        for x in sorted(pv):
            if clusters and abs(x - clusters[-1][0]) <= tol:
                lvl, cnt = clusters[-1]
                clusters[-1] = ((lvl * cnt + x) / (cnt + 1), cnt + 1)
            else:
                clusters.append((x, 1))
        out.append([c for c in clusters if c[1] >= 2])
    return out[1], out[0], tol  # supports (from lows), resistances (from highs), tolerance


def session_bounds(rs, session):
    a, b = SESSIONS[session]
    last = rs[-1]["time"]
    day = last // 86400000
    def rows_of(d):
        return [r for r in rs if r["time"] // 86400000 == d and a <= (r["time"] // 3600000) % 24 < b]
    rows = rows_of(day)
    if not rows or (last // 3600000) % 24 < a:
        rows = rows_of(day - 1)
    if not rows:
        return None
    return max(r["high"] for r in rows), min(r["low"] for r in rows)


def day_rows(rs, back):
    day = rs[-1]["time"] // 86400000 - back
    return [r for r in rs if r["time"] // 86400000 == day]


def week_rows(rs, back):
    week = (rs[-1]["time"] // 86400000 + 3) // 7 - back  # Monday-based weeks
    return [r for r in rs if (r["time"] // 86400000 + 3) // 7 == week]


def extra_indicator(kind, rs, p):
    e = _h()
    closes = _closes(rs)
    last = rs[-1]
    n = p.get("period", 14)
    if kind == "hma":
        s = hma_series(closes, n)
        return s[-1] if s else None
    if kind == "dema":
        e1 = e._ema_series(closes, n)
        e2 = e._ema_series(e1, n)
        return 2 * e1[-1] - e2[-1] if e2 else None
    if kind.startswith("keltner"):
        if len(rs) < n + 1:
            return None
        mid = e._ema_series(closes, n)[-1]
        a = atr_series(rs, n)[-1]
        return {"keltnerUpper": mid + p["mult"] * a, "keltnerMiddle": mid, "keltnerLower": mid - p["mult"] * a}[kind]
    if kind in ("tenkan", "kijun", "senkouA", "senkouB"):
        conv, base, lag, disp = p["conversion"], p["base"], p["lagging"], p["displacement"]
        def mid(rows, m):
            return (max(r["high"] for r in rows[-m:]) + min(r["low"] for r in rows[-m:])) / 2 if len(rows) >= m else None
        if kind == "tenkan":
            return mid(rs, conv)
        if kind == "kijun":
            return mid(rs, base)
        rows = rs[: len(rs) - disp] if disp else rs
        if not rows:
            return None
        if kind == "senkouA":
            t, k = mid(rows, conv), mid(rows, base)
            return (t + k) / 2 if t is not None and k is not None else None
        return mid(rows, lag)
    if kind in ("superTrend", "superTrendDir"):
        if len(rs) < n + 1:
            return None
        v, d = supertrend(rs, n, p["mult"])
        return v if kind == "superTrend" else d
    if kind in ("psar", "psarDir"):
        v, d = psar(rs, p["step"], p["maxStep"])
        return v if kind == "psar" else d
    if kind in ("diPlus", "diMinus"):
        if len(rs) < n + 1:
            return None
        dp, dm = _dm(rs, n)[-1]
        return dp if kind == "diPlus" else dm
    if kind == "mfi":
        if len(rs) < n + 1:
            return None
        pos = neg = 0.0
        for i in range(len(rs) - n, len(rs)):
            flow = _tp(rs[i]) * rs[i]["volume"]
            if _tp(rs[i]) > _tp(rs[i - 1]):
                pos += flow
            elif _tp(rs[i]) < _tp(rs[i - 1]):
                neg += flow
        return 100 - 100 / (1 + pos / neg) if neg else 100.0
    if kind == "cmf":
        if len(rs) < n:
            return None
        vol = sum(r["volume"] for r in rs[-n:])
        mfv = sum(((r["close"] - r["low"]) - (r["high"] - r["close"])) / (r["high"] - r["low"]) * r["volume"] if r["high"] > r["low"] else 0 for r in rs[-n:])
        return mfv / vol if vol else None
    if kind == "cmo":
        if len(rs) < n + 1:
            return None
        ds = [closes[i] - closes[i - 1] for i in range(len(rs) - n, len(rs))]
        up, dn = sum(d for d in ds if d > 0), -sum(d for d in ds if d < 0)
        return (up - dn) / (up + dn) * 100 if up + dn else 0.0
    if kind == "pgo":
        if len(rs) < n + 1:
            return None
        a = atr_series(rs, n)[-1]
        return (last["close"] - e._sma(closes, n)) / a if a else None
    if kind == "momentum":
        return closes[-1] - closes[-1 - n] if len(closes) > n else None
    if kind == "obv":
        v = 0.0
        for i in range(1, len(rs)):
            v += rs[i]["volume"] if closes[i] > closes[i - 1] else -rs[i]["volume"] if closes[i] < closes[i - 1] else 0
        return v
    if kind in ("kdjK", "kdjD", "kdjJ"):
        if len(rs) < n:
            return None
        k, d, j = kdj(rs, n, p["smooth"])
        return {"kdjK": k, "kdjD": d, "kdjJ": j}[kind]
    if kind == "tdSetup":
        return td_setup(rs)
    if kind in ("sslUp", "sslDown"):
        if len(rs) < n + 1:
            return None
        hi = sum(r["high"] for r in rs[-n:]) / n
        lo = sum(r["low"] for r in rs[-n:]) / n
        up = last["close"] > hi
        return (hi if up else lo) if kind == "sslUp" else (lo if up else hi)
    if kind == "fibLevel":
        highs, lows = e._pivots(rs, n, True), e._pivots(rs, n, False)
        if not highs or not lows:
            return None
        (th, h), (tl, l) = highs[-1], lows[-1]
        lvl = p["level"]
        return h - lvl * (h - l) if th > tl else l + lvl * (h - l)
    if kind in ("supportLevel", "resistanceLevel"):
        sup, res, _ = levels(rs, n)
        if kind == "supportLevel":
            below = [x for x, _ in sup if x <= last["close"]]
            return max(below) if below else None
        above = [x for x, _ in res if x >= last["close"]]
        return min(above) if above else None
    if kind == "rangePosition":
        highs, lows = e._pivots(rs, n, True), e._pivots(rs, n, False)
        if not highs or not lows:
            return None
        h, l = highs[-1][1], lows[-1][1]
        return (last["close"] - l) / (h - l) * 100 if h > l else None
    if kind == "structureTrend":
        import smc

        st = smc.structure(rs, n)
        return None if st["swingHigh"] is None and st["swingLow"] is None else st["trend"]
    if kind.startswith("ob"):
        import smc

        ob = smc.order_blocks(rs, n)
        block = ob["bullish"] if "Bull" in kind else ob["bearish"]
        if not block:
            return None
        return block["top"] if kind.endswith("Top") else block["bottom"]
    if kind.startswith("fvg"):
        import smc

        gaps = smc.fair_value_gaps(rs)
        gap = gaps["bullish"] if "Bull" in kind else gaps["bearish"]
        if not gap:
            return None
        return gap["top"] if kind.endswith("Top") else gap["bottom"]
    if kind in ("sessionHigh", "sessionLow"):
        b = session_bounds(rs, p["session"])
        return None if not b else b[0] if kind == "sessionHigh" else b[1]
    if kind in ("prevDayHigh", "prevDayLow", "prevDayClose"):
        rows = day_rows(rs, 1)
        if not rows or rs[0]["time"] // 86400000 >= rows[0]["time"] // 86400000:
            return None  # the window must start before the previous day to cover it fully
        return max(r["high"] for r in rows) if kind == "prevDayHigh" else min(r["low"] for r in rows) if kind == "prevDayLow" else rows[-1]["close"]
    if kind == "dayOpen":
        rows = day_rows(rs, 0)
        return rows[0]["open"] if rows else None
    if kind in ("prevWeekHigh", "prevWeekLow"):
        rows = week_rows(rs, 1)
        if not rows or (rs[0]["time"] // 86400000 + 3) // 7 >= (rows[0]["time"] // 86400000 + 3) // 7:
            return None
        return max(r["high"] for r in rows) if kind == "prevWeekHigh" else min(r["low"] for r in rows)
    return None
