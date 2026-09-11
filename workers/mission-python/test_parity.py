"""Drakdoo-parity indicators, patterns, modifiers, formulas and Smart Money Concepts."""

import math, unittest
import pandas as pd
import engine, library, smc, patterns
from engine import indicator, pattern, validate, Evaluator
from test_engine import plan, rule
from test_library import ROWS, DF, market, bar, ema_ref, wilder_ref, tr_ref


def close(t, kind, expected, **p):
    got = indicator(kind, ROWS, {**{k: engine.DEFAULTS[k] for k in engine.PARAMS[kind]}, **p})
    t.assertIsNotNone(got, kind)
    t.assertTrue(math.isclose(got, expected, rel_tol=1e-9, abs_tol=1e-9), f"{kind}: {got} != {expected}")


class Indicators(unittest.TestCase):
    def test_hull_and_dema(self):
        n = 16
        wma = lambda s, m: s.rolling(m).apply(lambda w: (w * range(1, m + 1)).sum() / (m * (m + 1) / 2), raw=True)
        raw = 2 * wma(DF.close, n // 2) - wma(DF.close, n)
        close(self, "hma", wma(raw.dropna().reset_index(drop=True), int(round(math.sqrt(n)))).iloc[-1], period=n)
        e1 = ema_ref(DF.close, n)
        e2 = ema_ref(e1.reset_index(drop=True), n)
        close(self, "dema", 2 * e1.iloc[-1] - e2.iloc[-1], period=n)

    def test_keltner(self):
        mid = ema_ref(DF.close, 20).iloc[-1]
        a = wilder_ref(tr_ref(), 20).iloc[-1]
        close(self, "keltnerUpper", mid + 2 * a, period=20)
        close(self, "keltnerMiddle", mid, period=20)
        close(self, "keltnerLower", mid - 1.5 * a, period=20, mult=1.5)

    def test_ichimoku(self):
        mid = lambda m, shift=0: ((DF.high.rolling(m).max() + DF.low.rolling(m).min()) / 2).shift(shift).iloc[-1]
        close(self, "tenkan", mid(9))
        close(self, "kijun", mid(26))
        close(self, "senkouA", ((mid(9, 26) + mid(26, 26)) / 2))
        close(self, "senkouB", mid(52, 26))

    def test_directional_and_flow(self):
        up_move, dn_move = DF.high.diff().iloc[1:], (-DF.low.diff()).iloc[1:]
        plus = pd.Series([u if u > d and u > 0 else 0.0 for u, d in zip(up_move, dn_move)])
        minus = pd.Series([d if d > u and d > 0 else 0.0 for u, d in zip(up_move, dn_move)])
        tr = wilder_ref(tr_ref(), 14)
        close(self, "diPlus", (100 * wilder_ref(plus, 14) / tr).iloc[-1])
        close(self, "diMinus", (100 * wilder_ref(minus, 14) / tr).iloc[-1])
        tp = (DF.high + DF.low + DF.close) / 3
        flow = tp * DF.volume
        d = tp.diff()
        pos = flow.where(d > 0, 0.0).iloc[-14:].sum()
        neg = flow.where(d < 0, 0.0).iloc[-14:].sum()
        close(self, "mfi", 100 - 100 / (1 + pos / neg))
        mfm = ((DF.close - DF.low) - (DF.high - DF.close)) / (DF.high - DF.low)
        close(self, "cmf", (mfm * DF.volume).iloc[-20:].sum() / DF.volume.iloc[-20:].sum(), period=20)
        dd = DF.close.diff().iloc[-14:]
        close(self, "cmo", (dd.clip(lower=0).sum() - (-dd).clip(lower=0).sum()) / dd.abs().sum() * 100)
        close(self, "momentum", DF.close.iloc[-1] - DF.close.iloc[-11], period=10)
        obv = (DF.volume * DF.close.diff().apply(lambda x: 1 if x > 0 else -1 if x < 0 else 0)).fillna(0).cumsum().iloc[-1]
        close(self, "obv", obv)
        close(self, "pgo", (DF.close.iloc[-1] - DF.close.rolling(14).mean().iloc[-1]) / wilder_ref(tr_ref(), 14).iloc[-1])

    def test_kdj_td_ssl(self):
        hh, ll = DF.high.rolling(9).max(), DF.low.rolling(9).min()
        rsv = (100 * (DF.close - ll) / (hh - ll)).dropna()
        k = d = 50.0
        for x in rsv:
            k = (2 * k + x) / 3
            d = (2 * d + k) / 3
        close(self, "kdjK", k, period=9)
        close(self, "kdjD", d, period=9)
        close(self, "kdjJ", 3 * k - 2 * d, period=9)
        rows = [bar(100 - i, 101 - i, 99 - i, 100 - i, i) for i in range(12)]  # closes falling: buy setup count
        self.assertEqual(indicator("tdSetup", rows, {}), 8)
        rows = [bar(100 + i, 101 + i, 99 + i, 100 + i, i) for i in range(9)]
        self.assertEqual(indicator("tdSetup", rows, {}), -5)
        hi, lo = DF.high.iloc[-10:].mean(), DF.low.iloc[-10:].mean()
        up = DF.close.iloc[-1] > hi
        close(self, "sslUp", hi if up else lo, period=10)
        close(self, "sslDown", lo if up else hi, period=10)

    def test_supertrend_and_psar_reference(self):
        # Independent straightforward implementations.
        rows = ROWS
        atr = wilder_ref(tr_ref(), 10).tolist()
        start = len(rows) - len(atr)
        fu = fl = None
        trend = 1
        for k, a in enumerate(atr):
            r = rows[start + k]
            hl2 = (r["high"] + r["low"]) / 2
            bu, bl = hl2 + 3 * a, hl2 - 3 * a
            pc = rows[start + k - 1]["close"] if start + k else r["close"]
            fl = bl if fl is None or bl > fl or pc < fl else fl
            fu = bu if fu is None or bu < fu or pc > fu else fu
            if k == 0:
                trend = 1 if r["close"] > bu else -1
            elif trend == 1 and r["close"] < fl:
                trend = -1
            elif trend == -1 and r["close"] > fu:
                trend = 1
            value = fl if trend == 1 else fu
        close(self, "superTrend", value, period=10, mult=3)
        self.assertEqual(indicator("superTrendDir", rows, {"period": 10, "mult": 3}), trend)
        v, d = library.psar(rows, 0.02, 0.2)
        self.assertIn(d, (1, -1))
        last = rows[-1]
        self.assertTrue(v < last["low"] if d == 1 else v > last["high"], "SAR sits on the opposite side of price")

    def test_levels_fib_and_range_position(self):
        rows = market(200, seed=11)
        highs, lows = engine._pivots(rows, 5, True), engine._pivots(rows, 5, False)
        (th, h), (tl, l) = highs[-1], lows[-1]
        expected = h - 0.618 * (h - l) if th > tl else l + 0.618 * (h - l)
        self.assertTrue(math.isclose(indicator("fibLevel", rows, {"period": 5, "level": 0.618}), expected))
        pos = (rows[-1]["close"] - l) / (h - l) * 100
        self.assertTrue(math.isclose(indicator("rangePosition", rows, {"period": 5}), pos))
        sup = indicator("supportLevel", rows, {"period": 3})
        res = indicator("resistanceLevel", rows, {"period": 3})
        if sup is not None:
            self.assertLessEqual(sup, rows[-1]["close"])
        if res is not None:
            self.assertGreaterEqual(res, rows[-1]["close"])

    def test_sessions_and_daily_levels(self):
        # Three UTC days of hourly candles; day 2 is the previous day for the last candle (day 3, 10:00).
        rows = [bar(100 + (i % 24), 100 + (i % 24) + 0.5, 100 + (i % 24) - 0.5, 100 + (i % 24), 0) for i in range(24 * 2 + 11)]
        for i, r in enumerate(rows):
            r["time"] = i * 3600000
        self.assertEqual(indicator("prevDayHigh", rows, {}), 100 + 23 + 0.5)
        self.assertEqual(indicator("prevDayLow", rows, {}), 99.5)
        self.assertEqual(indicator("prevDayClose", rows, {}), 123)
        self.assertEqual(indicator("dayOpen", rows, {}), 100)
        self.assertEqual(indicator("sessionHigh", rows, {"session": "asia"}), 107.5)  # today 00–08 UTC
        self.assertEqual(indicator("sessionLow", rows, {"session": "london"}), 106.5)  # today 07–10 so far
        self.assertIsNone(indicator("prevDayHigh", rows[30:], {}), "previous day not fully covered")


class Patterns(unittest.TestCase):
    def check(self, name, rows, expected, **kw):
        value, details = pattern(name, rows, kw.pop("n", 5), kw)
        self.assertEqual(value, expected, f"{name}: {details}")

    def test_candles(self):
        self.check("gravestoneDoji", [bar(100, 104, 99.9, 100.05)], True)
        self.check("dragonflyDoji", [bar(100, 100.1, 96, 100.05)], True)
        self.check("marubozuBullish", [bar(100, 105.2, 99.9, 105)], True)
        self.check("marubozuBearish", [bar(105, 105.1, 99.8, 100)], True)
        self.check("spinningTop", [bar(100, 103, 97, 100.5)], True)
        self.check("invertedHammer", [bar(102, 102.5, 99, 99.5), bar(99.5, 103, 99.3, 100)], True)
        self.check("hangingMan", [bar(99, 101, 98.5, 100.5), bar(101, 101.3, 97, 100.6)], True)
        self.check("haramiBullish", [bar(104, 104.5, 99, 99.5), bar(100.5, 102, 100.2, 101.5)], True)
        self.check("haramiBearish", [bar(99.5, 104.5, 99, 104), bar(103, 103.4, 101, 101.5)], True)
        self.check("piercingLine", [bar(104, 104.5, 99.5, 100), bar(99, 103.5, 98.8, 102.5)], True)
        self.check("darkCloudCover", [bar(100, 104.5, 99.5, 104), bar(105, 105.2, 100.5, 101.5)], True)
        self.check("threeInsideUp", [bar(104, 104.5, 99, 99.5), bar(100.5, 102, 100.2, 101.5), bar(101.5, 105, 101.3, 104.5)], True)
        self.check("threeInsideDown", [bar(99.5, 104.5, 99, 104), bar(103, 103.4, 101, 101.5), bar(101.5, 101.6, 98, 98.5)], True)

    def test_chart_patterns(self):
        def series(highs, between_low=2):
            rows, t = [bar(3, 3.4, 2.6, 3, i) for i in range(4)], 4
            for h in highs:
                for x in [3, 4, h, 4, 3, between_low, 3]:
                    rows.append(bar(x, x + 0.4, x - 0.4, x, t))
                    t += 1
            return rows
        rows = series([10, 10.05]) + [bar(2.5, 2.6, 1.2, 1.4, 99)]  # close below the neckline low (1.6)
        self.check("doubleTop", rows, True, n=3)
        self.check("doubleTop", series([10, 12]) + [bar(2.5, 2.6, 1.2, 1.4, 99)], False, n=3)
        inv = [dict(r, high=20 - r["low"], low=20 - r["high"], open=20 - r["open"], close=20 - r["close"]) for r in rows]
        self.check("doubleBottom", inv, True, n=3)
        self.check("insideBarBreakoutUp", [bar(100, 105, 95, 101), bar(101, 103, 97, 100), bar(100, 106, 99.8, 105.5)], True)
        self.check("insideBarBreakoutDown", [bar(100, 105, 95, 101), bar(101, 103, 97, 100), bar(100, 100.2, 94, 94.5)], True)
        cup = [bar(100, 100.5, 99.5, 100, i) for i in range(6)]
        path = [100 - 8 * math.sin(math.pi * i / 30) for i in range(31)]
        cup += [bar(x, x + 0.3, x - 0.3, x, 10 + i) for i, x in enumerate(path)]
        self.check("cup", cup, True, n=5)
        squeeze = [bar(100 + math.sin(i) * 3, 100 + math.sin(i) * 3 + 0.5, 100 + math.sin(i) * 3 - 0.5, 100 + math.sin(i) * 3, i) for i in range(80)]
        squeeze += [bar(100, 100.05, 99.95, 100 + 0.01 * (i % 2), 80 + i) for i in range(25)]
        self.check("bbSqueeze", squeeze, True, period=20)

    def test_divergence(self):
        # Price makes a lower low while RSI makes a higher low: regular bullish divergence.
        rows = []
        t = 0
        def leg(values):
            nonlocal t
            for v in values:
                rows.append(bar(v, v + 0.3, v - 0.3, v, t))
                t += 1
        leg([100 + i for i in range(20)])            # rise to 119 (RSI high)
        leg([119 - 3 * i for i in range(1, 11)])     # sharp fall to 89 → first low, RSI very low
        leg([89 + 0.9 * i for i in range(1, 11)])    # bounce to 98
        v = 98.0
        chop = []
        for i in range(30):                          # choppy decline: RSI stays higher while price goes lower
            v -= 0.8
            chop.append(v)
            v += 0.45
            chop.append(v)
        chop.append(v - 1.2)                         # final lower low (~86.3)
        leg(chop)
        leg([chop[-1] + 0.6 * i for i in range(1, 6)])  # confirmation bars
        value, details = pattern("divergenceBullish", rows, 5, {"source": "rsi"})
        self.assertTrue(value, details)
        self.assertLess(details["priceLatest"], details["pricePrevious"])
        self.assertGreater(details["oscLatest"], details["oscPrevious"])
        value, _ = pattern("hiddenDivergenceBullish", rows, 5, {"source": "rsi"})
        self.assertFalse(value)

    def test_harmonics(self):
        # Bullish Gartley: X low, A high, B = 0.618 retrace, C = 0.618 of AB, D = 0.786 of XA.
        X, A = 100.0, 110.0
        B = A - 0.618 * (A - X)
        C = B + 0.618 * (A - B)
        D = A - 0.786 * (A - X)
        rows, t = [bar(X + 2 - 0.5 * i, X + 2.05 - 0.5 * i, X + 1.95 - 0.5 * i, X + 2 - 0.5 * i, i) for i in range(5)], 5  # ends exactly at X
        for a, b in [(X, A), (A, B), (B, C), (C, D)]:
            for i in range(1, 7):
                v = a + (b - a) * i / 6
                rows.append(bar(v, v + 0.05, v - 0.05, v, t))
                t += 1
        rows += [bar(D + 0.2 * i, D + 0.2 * i + 0.05, D + 0.2 * i - 0.05, D + 0.2 * i, t + i) for i in range(1, 7)]
        value, details = pattern("gartleyBullish", rows, 3, {})
        self.assertTrue(value, details)
        self.assertFalse(pattern("crabBullish", rows, 3, {})[0])
        self.assertFalse(pattern("gartleyBearish", rows, 3, {})[0])

    def test_support_resistance(self):
        rows, t = [], 0
        for _ in range(3):  # three touches of a floor at 100
            for x in [104, 102, 100, 102, 104, 106, 104]:
                rows.append(bar(x, x + 0.3, x - 0.3, x, t))
                t += 1
        rows.append(bar(102, 102.2, 100.1, 100.2, t))
        self.assertTrue(pattern("nearSupport", rows, 2, {})[0])
        rows.append(bar(100.2, 100.3, 97, 97.5, t + 1))
        self.assertTrue(pattern("brokeSupport", rows, 2, {})[0])


class SmartMoney(unittest.TestCase):
    def walk(self, closes, t0=0):
        return [bar(c, c + 0.5, c - 0.5, c, t0 + i) for i, c in enumerate(closes)]

    def test_structure_bos_and_choch(self):
        # Uptrend: higher highs, then a break below the last swing low = bearish CHoCH.
        closes = [10, 11, 12, 13, 12, 11, 12, 13, 14, 15, 14, 13, 14, 15, 16, 17, 16, 15, 14, 13, 12, 11, 10]
        rows = self.walk(closes)
        st = smc.structure(rows, 2)
        self.assertEqual(st["trend"], -1)
        kinds = [(e[1], e[2]) for e in st["events"]]
        self.assertIn(("bos", 1), kinds)
        self.assertEqual(kinds[-1], ("choch", -1))
        # The bar where the CHoCH happened flags the pattern; the next bar does not.
        idx = st["events"][-1][0]
        self.assertTrue(smc.smc_pattern("chochBearish", rows[: idx + 1], 2)[0])
        self.assertFalse(smc.smc_pattern("chochBearish", rows[: idx + 2], 2)[0])
        self.assertEqual(indicator("structureTrend", rows, {"period": 2}), -1)

    def test_order_block_and_fvg(self):
        # Down candle at 12→11, then a strong rally that breaks the swing high 13 → bullish OB is that candle.
        closes = [10, 11, 12, 13, 12, 11]
        rows = self.walk(closes)
        rows.append(bar(11, 11.2, 10.6, 10.8, 6))     # last down candle before the break (OB)
        rows.append(bar(10.8, 15.5, 10.7, 15.2, 7))   # displacement, closes above swing high 13.5
        rows.append(bar(15.2, 16, 15.8, 15.9, 8))     # leaves a gap: low 15.8 > high of two bars back (11.2)
        ob = smc.order_blocks(rows, 2)
        self.assertIsNotNone(ob["bullish"])
        self.assertEqual((ob["bullish"]["top"], ob["bullish"]["bottom"]), (11.2, 10.6))
        self.assertEqual(indicator("obBullTop", rows, {"period": 2}), 11.2)
        g = smc.fair_value_gaps(rows)
        self.assertTrue(g["formedBullish"])
        self.assertEqual((g["bullish"]["top"], g["bullish"]["bottom"]), (15.8, 11.2))
        self.assertTrue(pattern("fvgBullish", rows, 2, {})[0])
        rows.append(bar(15.9, 16, 13, 13.5, 9))       # trades back into the gap
        self.assertTrue(pattern("inBullishFVG", rows, 2, {})[0])
        rows.append(bar(13.5, 13.6, 10.9, 11.0, 10))  # into the order block
        self.assertTrue(pattern("inBullishOB", rows, 2, {})[0])
        self.assertTrue(pattern("obBullMitigated", rows, 2, {})[0])
        rows.append(bar(11, 11.1, 9.5, 9.8, 11))      # closes below the OB: mitigated, gone
        self.assertIsNone(indicator("obBullTop", rows, {"period": 2}))

    def test_liquidity_sweep_equal_highs_displacement(self):
        rows = self.walk([10, 11, 12, 11, 10, 11, 12.02, 11, 10, 11])
        self.assertTrue(pattern("equalHighs", rows, 2, {})[0])
        rows.append(bar(11, 12.6, 10.9, 11.4, 10))    # wick above swing high 12.52, closes back below
        self.assertTrue(pattern("sweepHigh", rows, 2, {})[0])
        self.assertFalse(pattern("sweepLow", rows, 2, {})[0])
        base = self.walk([10 + 0.1 * (i % 3) for i in range(30)])
        base.append(bar(10, 13, 9.9, 12.9, 30))
        self.assertTrue(pattern("displacementUp", base, 5, {"mult": 1.5})[0])
        self.assertFalse(pattern("displacementDown", base, 5, {"mult": 1.5})[0])

    def test_premium_discount(self):
        rows = self.walk([10, 11, 12, 13, 14, 13, 12, 11, 10, 11, 12])
        pos = indicator("rangePosition", rows, {"period": 2})
        self.assertTrue(0 <= pos <= 100)
        self.assertEqual(pattern("inDiscount", rows, 2, {})[0], pos < 50)
        self.assertEqual(pattern("inPremium", rows, 2, {})[0], pos > 50)


class ModifiersAndFormulas(unittest.TestCase):
    def evaluator(self, rows, entry):
        p = plan()
        p["flow"]["entry"] = entry
        validate(p["flow"])
        at = rows[-1]["time"] + 60000 - 1
        return Evaluator(p, {"BTCUSDT:1m": rows}, at)

    def test_modifier_functions(self):
        rows = [bar(100 + i, 101 + i, 99 + i, 100 + i, i) for i in range(40)]
        ev = self.evaluator(rows, rule("x", "gt", {"kind": "close"}, 0))
        self.assertEqual(ev.value({"kind": "mod", "fn": "average", "of": {"kind": "close"}, "length": 5}, ev.at), 137)
        self.assertEqual(ev.value({"kind": "mod", "fn": "max", "of": {"kind": "close"}, "length": 5}, ev.at), 139)
        self.assertEqual(ev.value({"kind": "mod", "fn": "min", "of": {"kind": "close"}, "length": 5}, ev.at), 135)
        self.assertEqual(ev.value({"kind": "mod", "fn": "lookback", "of": {"kind": "close"}, "length": 3}, ev.at), 136)
        self.assertEqual(ev.value({"kind": "mod", "fn": "direction", "of": {"kind": "sma", "period": 3}, "length": 4}, ev.at), 1)
        self.assertEqual(ev.value({"kind": "mod", "fn": "sign", "of": {"kind": "change", "period": 1}, "length": 4}, ev.at), 1)
        self.assertTrue(math.isclose(ev.value({"kind": "mod", "fn": "stdev", "of": {"kind": "close"}, "length": 5}, ev.at), math.sqrt(2)))
        self.assertIsNone(ev.value({"kind": "mod", "fn": "average", "of": {"kind": "sma", "period": 30}, "length": 20}, ev.at), "waits while inner history is short")

    def test_modifier_validation(self):
        p = plan()
        good = rule("x", "gt", {"kind": "mod", "fn": "average", "ma": "ema", "of": {"kind": "rsi", "period": 14}, "length": 5}, 50)
        validate({**p["flow"], "entry": good})
        for bad in [
            {"kind": "mod", "fn": "median", "of": {"kind": "close"}, "length": 5},
            {"kind": "mod", "fn": "max", "of": {"kind": "close"}, "length": 500},
            {"kind": "mod", "fn": "max", "of": {"kind": "mod", "fn": "min", "of": {"kind": "mod", "fn": "max", "of": {"kind": "close"}, "length": 3}, "length": 3}, "length": 3},
        ]:
            with self.assertRaises(ValueError):
                validate({**p["flow"], "entry": rule("x", "gt", bad, 1)})

    def test_formula(self):
        rows = [bar(100, 101, 99, 100 + i * 0.5, i) for i in range(40)]
        node = {"id": "f", "op": "formula", "left": {"kind": "close"}, "right": {"kind": "mod", "fn": "lookback", "of": {"kind": "close"}, "length": 10}, "expr": "a/b > 1.03 and close > open"}
        ev = self.evaluator(rows, node)
        self.assertTrue(ev.node(node))
        self.assertEqual(ev.trace["f"]["status"], "pass")
        p = plan()
        for bad in ["__import__('os')", "a.real > 1", "a + b", "open(1)", "a > b or c > 1"]:
            with self.assertRaises(ValueError):
                validate({**p["flow"], "entry": {**node, "expr": bad}})
        self.assertIsNone(engine.run_formula("a/b > 1", {"a": 1, "b": 0, "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}))

    def test_every_kind_and_pattern_is_reachable(self):
        p = plan()
        for kind in engine.KINDS:
            params = {k: engine.DEFAULTS[k] for k in engine.PARAMS[kind]}
            validate({**p["flow"], "entry": rule("x", "gt", {"kind": kind, **params}, 1)})
            self.assertIn(indicator(kind, ROWS[:3], params), (None,) if kind not in engine.PRICE + engine.BAR_KINDS + ("obv", "tdSetup", "dayOpen") else (indicator(kind, ROWS[:3], params),))
        for name in engine.PATTERNS:
            validate({**p["flow"], "entry": {"id": "x", "op": "pattern", "name": name}})
            value, details = pattern(name, ROWS, 5, {})
            self.assertIn(value, (True, False, None), name)
            self.assertIsInstance(details, dict, name)


if __name__ == "__main__":
    unittest.main()
