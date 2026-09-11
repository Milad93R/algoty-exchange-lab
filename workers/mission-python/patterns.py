"""Extended candle, chart, divergence, harmonic and support/resistance patterns (Drakdoo parity)."""

CANDLE_PATTERNS = (
    "gravestoneDoji", "dragonflyDoji", "marubozuBullish", "marubozuBearish", "invertedHammer", "hangingMan",
    "haramiBullish", "haramiBearish", "spinningTop", "piercingLine", "darkCloudCover", "threeInsideUp", "threeInsideDown",
)
CHART_PATTERNS = ("doubleTop", "doubleBottom", "cup", "bbSqueeze", "insideBarBreakoutUp", "insideBarBreakoutDown")
DIVERGENCES = ("divergenceBullish", "divergenceBearish", "hiddenDivergenceBullish", "hiddenDivergenceBearish")
HARMONICS = ("gartleyBullish", "gartleyBearish", "batBullish", "batBearish", "butterflyBullish", "butterflyBearish", "crabBullish", "crabBearish")
LEVEL_PATTERNS = ("nearSupport", "nearResistance", "brokeSupport", "brokeResistance")
EXTRA_PATTERNS = CANDLE_PATTERNS + CHART_PATTERNS + DIVERGENCES + HARMONICS + LEVEL_PATTERNS
# Extra parameters accepted by pattern nodes: period (swing strength / lookback) is shared; these are specific.
PATTERN_PARAMS = {**{k: ("source",) for k in DIVERGENCES}}
SOURCES = ("rsi", "macdHist")


def _e():
    import engine

    return engine


def body(r):
    return abs(r["close"] - r["open"])


def rng(r):
    return r["high"] - r["low"]


def upper(r):
    return r["high"] - max(r["open"], r["close"])


def lower(r):
    return min(r["open"], r["close"]) - r["low"]


def bull(r):
    return r["close"] > r["open"]


def bear(r):
    return r["close"] < r["open"]


def candle(name, rs):
    need = 3 if name in ("threeInsideUp", "threeInsideDown") else 1 if name in ("gravestoneDoji", "dragonflyDoji", "marubozuBullish", "marubozuBearish", "spinningTop") else 2
    if len(rs) < need:
        return None
    last = rs[-1]
    prev = rs[-2] if len(rs) > 1 else None
    if rng(last) <= 0:
        return False
    if name == "gravestoneDoji":
        return body(last) <= 0.1 * rng(last) and upper(last) >= 0.6 * rng(last) and lower(last) <= 0.1 * rng(last)
    if name == "dragonflyDoji":
        return body(last) <= 0.1 * rng(last) and lower(last) >= 0.6 * rng(last) and upper(last) <= 0.1 * rng(last)
    if name == "marubozuBullish":
        return bull(last) and body(last) >= 0.9 * rng(last)
    if name == "marubozuBearish":
        return bear(last) and body(last) >= 0.9 * rng(last)
    if name == "spinningTop":
        return body(last) > 0 and body(last) <= 0.3 * rng(last) and upper(last) >= body(last) and lower(last) >= body(last)
    if name == "invertedHammer":  # shooting-star shape after a down candle
        return bear(prev) and body(last) > 0 and upper(last) >= 2 * body(last) and lower(last) <= body(last)
    if name == "hangingMan":  # hammer shape after an up candle
        return bull(prev) and body(last) > 0 and lower(last) >= 2 * body(last) and upper(last) <= body(last)
    if name == "haramiBullish":
        return bear(prev) and bull(last) and last["open"] > prev["close"] and last["close"] < prev["open"] and body(last) < body(prev)
    if name == "haramiBearish":
        return bull(prev) and bear(last) and last["open"] < prev["close"] and last["close"] > prev["open"] and body(last) < body(prev)
    if name == "piercingLine":
        mid = (prev["open"] + prev["close"]) / 2
        return bear(prev) and bull(last) and last["open"] < prev["close"] and mid < last["close"] < prev["open"]
    if name == "darkCloudCover":
        mid = (prev["open"] + prev["close"]) / 2
        return bull(prev) and bear(last) and last["open"] > prev["close"] and prev["open"] < last["close"] < mid
    if name == "threeInsideUp":
        a, b, c = rs[-3], rs[-2], rs[-1]
        return bear(a) and bull(b) and b["open"] > a["close"] and b["close"] < a["open"] and bull(c) and c["close"] > a["open"]
    if name == "threeInsideDown":
        a, b, c = rs[-3], rs[-2], rs[-1]
        return bull(a) and bear(b) and b["open"] < a["close"] and b["close"] > a["open"] and bear(c) and c["close"] < a["open"]
    return None


def chart(name, rs, n, p):
    e = _e()
    if name in ("doubleTop", "doubleBottom"):
        top = name == "doubleTop"
        pv = e._pivots(rs, n, top)
        if len(pv) < 2:
            return None, {"swings": len(pv)}
        (t1, a), (t2, b) = pv[-2], pv[-1]
        import library

        tol = 0.5 * library.atr_series(rs, 14)[-1] if len(rs) > 15 else abs(a) * 0.003
        between = [r for r in rs if t1 < r["time"] < t2]
        if not between or abs(a - b) > tol:
            return False, {"first": a, "second": b, "tolerance": tol}
        neck = min(r["low"] for r in between) if top else max(r["high"] for r in between)
        confirmed = rs[-1]["close"] < neck if top else rs[-1]["close"] > neck
        return confirmed, {"first": a, "second": b, "neckline": neck}
    if name == "cup":
        # Approximate U-shape: a prior high, a rounded decline of at least 5% and a return to within 1.5% of the high.
        look = rs[-max(20, min(len(rs), 4 * n * 10)) :]
        hi_i = max(range(len(look) // 2), key=lambda i: look[i]["high"])
        rim = look[hi_i]["high"]
        after = look[hi_i:]
        low = min(r["low"] for r in after)
        depth = (rim - low) / rim
        recovered = rs[-1]["close"] >= rim * 0.985 and rs[-1]["close"] <= rim * 1.02
        lo_i = min(range(len(after)), key=lambda i: after[i]["low"])
        rounded = 0.25 <= lo_i / max(1, len(after) - 1) <= 0.75
        return depth >= 0.05 and recovered and rounded, {"rim": rim, "low": low, "depthPct": depth * 100}
    if name == "bbSqueeze":
        period = p.get("period", 20)
        look = 100
        widths = []
        for k in range(max(period, len(rs) - look), len(rs) + 1):
            w = e.indicator("bbWidth", rs[:k], {"period": period, "mult": 2})
            if w is not None:
                widths.append(w)
        if len(widths) < 10:
            return None, {}
        return widths[-1] <= min(widths) * 1.05, {"width": widths[-1], "minimum": min(widths)}
    if name in ("insideBarBreakoutUp", "insideBarBreakoutDown"):
        if len(rs) < 3:
            return None, {}
        mother, inside, last = rs[-3], rs[-2], rs[-1]
        is_inside = inside["high"] < mother["high"] and inside["low"] > mother["low"]
        if name.endswith("Up"):
            return is_inside and last["close"] > mother["high"], {"motherHigh": mother["high"]}
        return is_inside and last["close"] < mother["low"], {"motherLow": mother["low"]}
    return None, {}


def oscillator_series(rs, source):
    import library

    if source == "rsi":
        s = library.rsi_series(rs, 14)
        return {len(rs) - len(s) + i: v for i, v in enumerate(s)}
    e = _e()
    out = {}
    for k in range(35, len(rs) + 1):
        v = e.indicator("macdHist", rs[:k], {"fast": 12, "slow": 26, "signal": 9})
        if v is not None:
            out[k - 1] = v
    return out


def divergence(name, rs, n, source):
    e = _e()
    bullish = name.endswith("Bullish")
    osc = oscillator_series(rs, source)
    key = "low" if bullish else "high"
    def is_pivot(i):
        left, right = [r[key] for r in rs[i - n : i]], [r[key] for r in rs[i + 1 : i + n + 1]]
        x = rs[i][key]
        return (x < min(left) and x <= min(right)) if bullish else (x > max(left) and x >= max(right))

    idx = [i for i in range(n, len(rs) - n) if is_pivot(i)]
    idx = [i for i in idx if i in osc]
    if len(idx) < 2:
        return None, {"swings": len(idx)}
    a, b = idx[-2], idx[-1]
    if b != len(rs) - 1 - n:  # the latest pivot must be the one just confirmed
        return False, {"latestPivotAge": len(rs) - 1 - b}
    pa, pb, oa, ob = rs[a][key], rs[b][key], osc[a], osc[b]
    hidden = name.startswith("hidden")
    if bullish:
        value = (pb < pa and ob > oa) if not hidden else (pb > pa and ob < oa)
    else:
        value = (pb > pa and ob < oa) if not hidden else (pb < pa and ob > oa)
    return value, {"pricePrevious": pa, "priceLatest": pb, "oscPrevious": oa, "oscLatest": ob, "source": source}


HARMONIC_RATIOS = {
    "gartley": dict(ab=(0.56, 0.68), bc=(0.382, 0.886), cd=(1.13, 1.618), ad=(0.72, 0.85)),
    "bat": dict(ab=(0.35, 0.55), bc=(0.382, 0.886), cd=(1.618, 2.618), ad=(0.83, 0.94)),
    "butterfly": dict(ab=(0.72, 0.85), bc=(0.382, 0.886), cd=(1.618, 2.24), ad=(1.2, 1.7)),
    "crab": dict(ab=(0.35, 0.68), bc=(0.382, 0.886), cd=(2.24, 3.618), ad=(1.5, 1.72)),
}


def harmonic(name, rs, n):
    e = _e()
    kind = name[: -len("Bullish")] if name.endswith("Bullish") else name[: -len("Bearish")]
    bullish = name.endswith("Bullish")
    pts = sorted([(t, x, "H") for t, x in e._pivots(rs, n, True)] + [(t, x, "L") for t, x in e._pivots(rs, n, False)])
    # keep alternating sequence
    seq = []
    for t, x, k in pts:
        if seq and seq[-1][2] == k:
            if (k == "H" and x > seq[-1][1]) or (k == "L" and x < seq[-1][1]):
                seq[-1] = (t, x, k)
            continue
        seq.append((t, x, k))
    if len(seq) < 5:
        return None, {"swings": len(seq)}
    X, A, B, C, D = seq[-5:]
    # Bullish pattern ends at a low D (X low, A high, B low, C high, D low).
    if (bullish and not (X[2] == "L" and D[2] == "L")) or (not bullish and not (X[2] == "H" and D[2] == "H")):
        return False, {"shape": "".join(s[2] for s in seq[-5:])}
    # Standard harmonic ratios: AB and AD are retracements of XA measured from A; BC of AB; CD an extension of BC.
    xa, ab, bc, cd, ad = abs(A[1] - X[1]), abs(B[1] - A[1]), abs(C[1] - B[1]), abs(D[1] - C[1]), abs(D[1] - A[1])
    if not xa or not ab or not bc:
        return False, {}
    r = HARMONIC_RATIOS[kind]
    ratios = {"ab": ab / xa, "bc": bc / ab, "cd": cd / bc, "ad": ad / xa}
    ok = all(r[k][0] <= ratios[k] <= r[k][1] for k in ratios)
    return ok, {k: round(v, 3) for k, v in ratios.items()}


def level_pattern(name, rs, n):
    import library

    sup, res, tol = library.levels(rs, n)
    last, prev = rs[-1], rs[-2]
    if name == "nearSupport":
        return any(abs(last["close"] - x) <= tol for x, _ in sup), {"levels": [round(x, 2) for x, _ in sup][-5:], "tolerance": tol}
    if name == "nearResistance":
        return any(abs(last["close"] - x) <= tol for x, _ in res), {"levels": [round(x, 2) for x, _ in res][-5:], "tolerance": tol}
    if name == "brokeSupport":
        return any(prev["close"] >= x and last["close"] < x - tol * 0.2 for x, _ in sup), {"levels": [round(x, 2) for x, _ in sup][-5:]}
    if name == "brokeResistance":
        return any(prev["close"] <= x and last["close"] > x + tol * 0.2 for x, _ in res), {"levels": [round(x, 2) for x, _ in res][-5:]}
    return None, {}


def extra_pattern(name, rs, n=5, p=None):
    p = p or {}
    if name in CANDLE_PATTERNS:
        v = candle(name, rs)
        return v, {"open": rs[-1]["open"], "high": rs[-1]["high"], "low": rs[-1]["low"], "close": rs[-1]["close"]}
    if name in CHART_PATTERNS:
        return chart(name, rs, n, p)
    if name in DIVERGENCES:
        return divergence(name, rs, n, p.get("source", "rsi"))
    if name in HARMONICS:
        return harmonic(name, rs, n)
    if name in LEVEL_PATTERNS:
        if len(rs) < 2:
            return None, {}
        return level_pattern(name, rs, n)
    return None, {}
