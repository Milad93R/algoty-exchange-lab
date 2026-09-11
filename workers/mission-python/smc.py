"""Smart Money Concepts on closed candles: market structure, order blocks, fair value gaps,
liquidity, premium/discount. Definitions follow the widely used LuxAlgo SMC conventions."""


def _pivots(rs, n, high):
    import engine

    return engine._pivots(rs, n, high)


def _atr(rs, n=14):
    import library

    s = library.atr_series(rs, n)
    return s[-1] if s else (rs[-1]["high"] - rs[-1]["low"])


def structure(rs, n=5):
    """Walk the window: track the latest confirmed swing high/low and detect breaks by close.
    Returns trend (+1/-1/0), the bar index and kind of the latest break, and swing levels."""
    highs = {i: True for i in range(n, len(rs) - n) if rs[i]["high"] > max(r["high"] for r in rs[i - n : i]) and rs[i]["high"] >= max(r["high"] for r in rs[i + 1 : i + n + 1])}
    lows = {i: True for i in range(n, len(rs) - n) if rs[i]["low"] < min(r["low"] for r in rs[i - n : i]) and rs[i]["low"] <= min(r["low"] for r in rs[i + 1 : i + n + 1])}
    trend = 0
    swing_high = swing_low = None  # (index, price, broken)
    events = []  # (bar index, "bos"/"choch", direction, swing index)
    for i in range(len(rs)):
        # A pivot at j becomes known only after n confirming bars, at bar j+n.
        j = i - n
        if j >= n:
            if j in highs:
                swing_high = [j, rs[j]["high"], False]
            if j in lows:
                swing_low = [j, rs[j]["low"], False]
        c = rs[i]["close"]
        if swing_high and not swing_high[2] and c > swing_high[1]:
            kind = "bos" if trend == 1 else "choch"
            events.append((i, kind, 1, swing_high[0]))
            swing_high[2] = True
            trend = 1
        if swing_low and not swing_low[2] and c < swing_low[1]:
            kind = "bos" if trend == -1 else "choch"
            events.append((i, kind, -1, swing_low[0]))
            swing_low[2] = True
            trend = -1
    return {
        "trend": trend,
        "events": events,
        "swingHigh": swing_high[1] if swing_high else None,
        "swingLow": swing_low[1] if swing_low else None,
    }


def order_blocks(rs, n=5):
    """Latest unmitigated bullish and bearish order blocks.
    Bullish OB: the last down candle before a bullish structure break, between the broken swing's
    origin and the break. It is mitigated once a later close falls below its bottom."""
    st = structure(rs, n)
    out = {"bullish": None, "bearish": None}
    for i, kind, direction, swing in reversed(st["events"]):
        key = "bullish" if direction == 1 else "bearish"
        if out[key]:
            continue
        candidates = [k for k in range(max(1, swing), i) if (rs[k]["close"] < rs[k]["open"] if direction == 1 else rs[k]["close"] > rs[k]["open"])]
        if not candidates:
            continue
        k = candidates[-1]
        top, bottom = rs[k]["high"], rs[k]["low"]
        mitigated = any((r["close"] < bottom) if direction == 1 else (r["close"] > top) for r in rs[i + 1 :])
        touched = any((r["low"] <= top) if direction == 1 else (r["high"] >= bottom) for r in rs[i + 1 :])
        block = {"index": k, "top": top, "bottom": bottom, "breakIndex": i, "mitigated": mitigated, "touched": touched}
        if not mitigated:
            out[key] = block
        else:
            out.setdefault(key + "Broken", block)
    return out


def fair_value_gaps(rs):
    """Latest unfilled bullish/bearish FVG (three-candle imbalance). A gap is filled when a later
    close moves through it entirely; `formed` tells whether a gap was created on the last bar."""
    out = {"bullish": None, "bearish": None, "formedBullish": False, "formedBearish": False}
    for i in range(2, len(rs)):
        if rs[i]["low"] > rs[i - 2]["high"]:
            gap = {"index": i, "top": rs[i]["low"], "bottom": rs[i - 2]["high"]}
            if not any(r["close"] < gap["bottom"] for r in rs[i + 1 :]):
                out["bullish"] = gap
            if i == len(rs) - 1:
                out["formedBullish"] = True
        if rs[i]["high"] < rs[i - 2]["low"]:
            gap = {"index": i, "top": rs[i - 2]["low"], "bottom": rs[i]["high"]}
            if not any(r["close"] > gap["top"] for r in rs[i + 1 :]):
                out["bearish"] = gap
            if i == len(rs) - 1:
                out["formedBearish"] = True
    return out


def smc_pattern(name, rs, n=5, mult=1.5):
    """Boolean SMC events on the last closed bar. Returns (value, details)."""
    last = rs[-1]
    if name in ("bosBullish", "bosBearish", "chochBullish", "chochBearish"):
        st = structure(rs, n)
        if not st["events"] and st["swingHigh"] is None and st["swingLow"] is None:
            return None, {}
        want = ("bos" if name.startswith("bos") else "choch", 1 if name.endswith("Bullish") else -1)
        hit = [e for e in st["events"] if e[0] == len(rs) - 1 and (e[1], e[2]) == want]
        return bool(hit), {"trend": st["trend"], "swingHigh": st["swingHigh"], "swingLow": st["swingLow"]}
    if name in ("inBullishOB", "inBearishOB", "obBullMitigated", "obBearMitigated", "breakerBullish", "breakerBearish"):
        ob = order_blocks(rs, n)
        if name.startswith("in"):
            b = ob["bullish"] if "Bullish" in name else ob["bearish"]
            if not b:
                return False, {"orderBlock": None}
            return b["bottom"] <= last["close"] <= b["top"], {"top": b["top"], "bottom": b["bottom"]}
        if name.startswith("ob"):
            b = ob["bullish"] if "Bull" in name else ob["bearish"]
            if not b:
                return False, {"orderBlock": None}
            touched_now = (last["low"] <= b["top"]) if "Bull" in name else (last["high"] >= b["bottom"])
            return b["touched"] and touched_now, {"top": b["top"], "bottom": b["bottom"]}
        # Breaker: an order block of the opposite side that price just closed through.
        b = ob.get("bearishBroken") if name == "breakerBullish" else ob.get("bullishBroken")
        if not b:
            return False, {"breaker": None}
        crossed = (last["close"] > b["top"] and rs[-2]["close"] <= b["top"]) if name == "breakerBullish" else (last["close"] < b["bottom"] and rs[-2]["close"] >= b["bottom"])
        return crossed, {"top": b["top"], "bottom": b["bottom"]}
    if name in ("fvgBullish", "fvgBearish", "inBullishFVG", "inBearishFVG"):
        if len(rs) < 3:
            return None, {}
        g = fair_value_gaps(rs)
        if name == "fvgBullish":
            return g["formedBullish"], {"gap": g["bullish"]}
        if name == "fvgBearish":
            return g["formedBearish"], {"gap": g["bearish"]}
        gap = g["bullish"] if "Bullish" in name else g["bearish"]
        if not gap:
            return False, {"gap": None}
        return gap["bottom"] <= last["close"] <= gap["top"], {"top": gap["top"], "bottom": gap["bottom"]}
    if name in ("equalHighs", "equalLows"):
        pv = _pivots(rs, n, name == "equalHighs")
        if len(pv) < 2:
            return None, {"swings": len(pv)}
        tol = 0.1 * _atr(rs)
        a, b = pv[-2][1], pv[-1][1]
        return abs(a - b) <= tol, {"previousSwing": a, "latestSwing": b, "tolerance": tol}
    if name in ("sweepHigh", "sweepLow"):
        pv = _pivots(rs[:-1], n, name == "sweepHigh")
        if not pv:
            return None, {}
        lvl = pv[-1][1]
        if name == "sweepHigh":
            return last["high"] > lvl and last["close"] < lvl, {"level": lvl, "high": last["high"], "close": last["close"]}
        return last["low"] < lvl and last["close"] > lvl, {"level": lvl, "low": last["low"], "close": last["close"]}
    if name in ("displacementUp", "displacementDown"):
        if len(rs) < 15:
            return None, {}
        a = _atr(rs[:-1])
        body = last["close"] - last["open"]
        return (body > mult * a) if name == "displacementUp" else (-body > mult * a), {"body": body, "atr": a, "mult": mult}
    if name in ("inPremium", "inDiscount", "atEquilibrium"):
        highs, lows = _pivots(rs, n, True), _pivots(rs, n, False)
        if not highs or not lows:
            return None, {}
        h, l = highs[-1][1], lows[-1][1]
        if h <= l:
            return None, {}
        pos = (last["close"] - l) / (h - l) * 100
        value = pos > 50 if name == "inPremium" else pos < 50 if name == "inDiscount" else 47.5 <= pos <= 52.5
        return value, {"rangePosition": pos, "rangeHigh": h, "rangeLow": l}
    return None, {}


SMC_PATTERNS = (
    "bosBullish", "bosBearish", "chochBullish", "chochBearish",
    "inBullishOB", "inBearishOB", "obBullMitigated", "obBearMitigated", "breakerBullish", "breakerBearish",
    "fvgBullish", "fvgBearish", "inBullishFVG", "inBearishFVG",
    "equalHighs", "equalLows", "sweepHigh", "sweepLow", "displacementUp", "displacementDown",
    "inPremium", "inDiscount", "atEquilibrium",
)
