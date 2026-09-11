"""Indicator library checked against an independent pandas reference; patterns on hand-built candles."""

import math, random, unittest
import pandas as pd
import engine
from engine import indicator, pattern, validate
from test_engine import plan, rule


def market(n=300, seed=7):
    random.seed(seed)
    rows, price = [], 100.0
    for i in range(n):
        o = price
        c = o * (1 + random.gauss(0, 0.004))
        h = max(o, c) * (1 + abs(random.gauss(0, 0.002)))
        l = min(o, c) * (1 - abs(random.gauss(0, 0.002)))
        rows.append(dict(time=i * 60000, open=o, high=h, low=l, close=c, volume=50 + random.random() * 100, closed=True))
        price = c
    return rows


ROWS = market()
DF = pd.DataFrame(ROWS)


def ema_ref(series, n):
    seed = series.iloc[:n].mean()
    rest = pd.concat([pd.Series([seed]), series.iloc[n:]], ignore_index=True)
    return rest.ewm(span=n, adjust=False).mean()


def wilder_ref(series, n):
    seed = series.iloc[:n].mean()
    rest = pd.concat([pd.Series([seed]), series.iloc[n:]], ignore_index=True)
    return rest.ewm(alpha=1 / n, adjust=False).mean()


def tr_ref():
    prev = DF.close.shift(1)
    return pd.concat([DF.high - DF.low, (DF.high - prev).abs(), (DF.low - prev).abs()], axis=1).max(axis=1).iloc[1:].reset_index(drop=True)


class Indicators(unittest.TestCase):
    def close(self, kind, expected, **p):
        got = indicator(kind, ROWS, {**{k: engine.DEFAULTS[k] for k in engine.PARAMS[kind]}, **p})
        self.assertIsNotNone(got, kind)
        self.assertTrue(math.isclose(got, expected, rel_tol=1e-9, abs_tol=1e-9), f"{kind}: {got} != {expected}")

    def test_price_kinds(self):
        last = ROWS[-1]
        self.close("close", last["close"])
        self.close("hl2", (last["high"] + last["low"]) / 2)
        self.close("typical", (last["high"] + last["low"] + last["close"]) / 3)
        self.close("bodyPct", (last["close"] - last["open"]) / last["open"] * 100)
        self.close("rangePct", (last["high"] - last["low"]) / last["open"] * 100)
        self.close("change", (DF.close.iloc[-1] / DF.close.iloc[-11] - 1) * 100, period=10)

    def test_moving_averages(self):
        self.close("sma", DF.close.rolling(20).mean().iloc[-1], period=20)
        self.close("ema", ema_ref(DF.close, 20).iloc[-1], period=20)
        w = pd.Series(range(1, 11), dtype=float)
        self.close("wma", (DF.close.iloc[-10:].reset_index(drop=True) * w).sum() / w.sum(), period=10)
        self.close("volumeSma", DF.volume.rolling(20).mean().iloc[-1], period=20)
        tp = (DF.high + DF.low + DF.close) / 3
        self.close("vwap", (tp * DF.volume).iloc[-20:].sum() / DF.volume.iloc[-20:].sum(), period=20)

    def test_rsi_atr_adx_are_wilder(self):
        d = DF.close.diff().iloc[1:].reset_index(drop=True)
        up, dn = wilder_ref(d.clip(lower=0), 14).iloc[-1], wilder_ref((-d).clip(lower=0), 14).iloc[-1]
        self.close("rsi", 100 - 100 / (1 + up / dn), period=14)
        self.close("atr", wilder_ref(tr_ref(), 14).iloc[-1], period=14)
        up_move, dn_move = DF.high.diff().iloc[1:], (-DF.low.diff()).iloc[1:]
        plus = pd.Series([u if u > d_ and u > 0 else 0.0 for u, d_ in zip(up_move, dn_move)])
        minus = pd.Series([d_ if d_ > u and d_ > 0 else 0.0 for u, d_ in zip(up_move, dn_move)])
        tr = wilder_ref(tr_ref(), 14)
        dip, dim = 100 * wilder_ref(plus, 14) / tr, 100 * wilder_ref(minus, 14) / tr
        dx = 100 * (dip - dim).abs() / (dip + dim)
        self.close("adx", wilder_ref(dx.reset_index(drop=True), 14).iloc[-1], period=14)

    def test_macd_family(self):
        line = ema_ref(DF.close, 12).iloc[-(300 - 26 + 1):].reset_index(drop=True) - ema_ref(DF.close, 26).reset_index(drop=True)
        sig = ema_ref(line, 9)
        self.close("macd", line.iloc[-1])
        self.close("macdSignal", sig.iloc[-1])
        self.close("macdHist", line.iloc[-1] - sig.iloc[-1])

    def test_bollinger_family(self):
        mid = DF.close.rolling(20).mean().iloc[-1]
        sd = DF.close.rolling(20).std(ddof=0).iloc[-1]
        self.close("bbMiddle", mid, period=20)
        self.close("bbUpper", mid + 2 * sd, period=20)
        self.close("bbLower", mid - 2.5 * sd, period=20, mult=2.5)
        self.close("bbWidth", 4 * sd / mid * 100, period=20)
        self.close("bbPercent", (DF.close.iloc[-1] - (mid - 2 * sd)) / (4 * sd) * 100, period=20)

    def test_oscillators(self):
        hh, ll = DF.high.rolling(14).max(), DF.low.rolling(14).min()
        k = 100 * (DF.close - ll) / (hh - ll)
        self.close("stochK", k.iloc[-1])
        self.close("stochD", k.rolling(3).mean().iloc[-1])
        self.close("williamsR", (hh.iloc[-1] - DF.close.iloc[-1]) / (hh.iloc[-1] - ll.iloc[-1]) * -100)
        tp = (DF.high + DF.low + DF.close) / 3
        m = tp.rolling(20).mean().iloc[-1]
        dev = (tp.iloc[-20:] - m).abs().mean()
        self.close("cci", (tp.iloc[-1] - m) / (0.015 * dev), period=20)
        self.close("highest", DF.high.iloc[-20:].max(), period=20)
        self.close("lowest", DF.low.iloc[-20:].min(), period=20)
        self.close("volumeRatio", DF.volume.iloc[-1] / DF.volume.iloc[-21:-1].mean(), period=20)

    def test_session_vwap_uses_utc_day(self):
        rows = [dict(r, time=(86400000 * 3 - 5 * 60000) + i * 60000) for i, r in enumerate(ROWS[:10])]
        day = [r for r in rows if r["time"] // 86400000 == 3]
        tp = lambda r: (r["high"] + r["low"] + r["close"]) / 3
        expected = sum(tp(r) * r["volume"] for r in day) / sum(r["volume"] for r in day)
        self.assertEqual(len(day), 5)
        self.assertTrue(math.isclose(indicator("vwapSession", rows, {}), expected))

    def test_swings(self):
        rows = market(120, seed=3)
        highs = [r["high"] for r in rows]
        pivots = [i for i in range(5, 115) if highs[i] > max(highs[i - 5 : i]) and highs[i] >= max(highs[i + 1 : i + 6])]
        self.assertTrue(pivots)
        self.assertEqual(indicator("swingHigh", rows, {"period": 5}), highs[pivots[-1]])
        self.assertIsNone(indicator("swingHigh", rows[:8], {"period": 5}))

    def test_insufficient_history_waits(self):
        for kind in engine.KINDS:
            p = {k: engine.DEFAULTS[k] for k in engine.PARAMS[kind]}
            if kind in engine.PRICE + engine.BAR_KINDS:
                continue
            self.assertIsNone(indicator(kind, ROWS[:3], p), kind)
            self.assertIsNotNone(indicator(kind, ROWS, p), kind)


def bar(o, h, l, c, i=0):
    return dict(time=i * 60000, open=o, high=h, low=l, close=c, volume=1, closed=True)


class Patterns(unittest.TestCase):
    def check(self, name, rows, expected, **kw):
        value, details = pattern(name, rows, **kw)
        self.assertEqual(value, expected, f"{name}: {details}")

    def test_single_candle(self):
        self.check("doji", [bar(100, 102, 98, 100.1)], True)
        self.check("doji", [bar(100, 102, 98, 101.5)], False)
        self.check("hammer", [bar(100, 100.4, 96, 101)], True)
        self.check("hammer", [bar(100, 104, 99.8, 101)], False)
        self.check("shootingStar", [bar(100, 104, 99.8, 99.5)], True)

    def test_two_candles(self):
        down, up = bar(100, 101, 98, 99), bar(98.5, 102, 98, 101.5)
        self.check("bullishEngulfing", [down, up], True)
        self.check("bearishEngulfing", [down, up], False)
        self.check("bearishEngulfing", [bar(99, 102, 98, 101), bar(101.5, 102, 97, 98)], True)
        self.check("insideBar", [bar(100, 105, 95, 101), bar(101, 103, 97, 100)], True)
        self.check("outsideBar", [bar(100, 103, 97, 101), bar(101, 105, 95, 100)], True)
        self.check("insideBar", [bar(100, 103, 97, 101)], None)

    def test_three_candles(self):
        soldiers = [bar(100, 103, 99.5, 102.5), bar(101, 105, 100.8, 104.5), bar(103, 107, 102.8, 106.5)]
        self.check("threeWhiteSoldiers", soldiers, True)
        self.check("threeBlackCrows", soldiers, False)
        crows = [bar(106, 106.5, 103, 103.5), bar(105, 105.2, 101, 101.5), bar(103, 103.2, 99, 99.5)]
        self.check("threeBlackCrows", crows, True)
        self.check("morningStar", [bar(105, 105.5, 100, 100.5), bar(100, 100.8, 99.4, 100.3), bar(100.5, 104.5, 100.2, 104)], True)
        self.check("eveningStar", [bar(100, 105, 99.5, 104.5), bar(104.6, 105.2, 104.2, 104.8), bar(104.5, 104.8, 100, 100.5)], True)

    def test_structure(self):
        def series(peaks):
            rows, t = [], 0
            for peak in peaks:
                for h in [1, 2, 3, peak, 3, 2, 1]:
                    rows.append(bar(h, h + 0.5, h - 0.5, h, t))
                    t += 1
            return rows
        self.check("higherHigh", series([10, 12]), True, n=3)
        self.check("lowerHigh", series([10, 12]), False, n=3)
        self.check("higherHigh", series([12, 10]), False, n=3)
        self.check("higherHigh", series([12]), None, n=3)


class Rules(unittest.TestCase):
    def test_validation_accepts_library_and_rejects_bad_params(self):
        p = plan()
        p["flow"]["entry"] = {"id": "e", "op": "all", "children": [
            rule("a", "gt", {"kind": "macdHist", "fast": 12, "slow": 26, "signal": 9}, 0),
            rule("b", "lt", {"kind": "bbPercent", "period": 20, "mult": 2}, 20),
            {"id": "c", "op": "pattern", "name": "bullishEngulfing"},
            {"id": "d", "op": "rising", "left": {"kind": "ema", "period": 20}, "bars": 3},
            rule("f", "crossAbove", {"kind": "close"}, {"kind": "swingHigh", "period": 5}),
        ]}
        validate(p["flow"])
        for bad in [
            {"kind": "macd", "period": 5},
            {"kind": "sma", "mult": 2},
            {"kind": "macd", "fast": 30, "slow": 26},
            {"kind": "bbUpper", "mult": 9},
        ]:
            with self.assertRaises(ValueError):
                validate({**p["flow"], "exit": rule("x", "gt", bad, 1)})
        with self.assertRaises(ValueError):
            validate({**p["flow"], "exit": {"id": "x", "op": "pattern", "name": "unicorn"}})

    def test_rising_and_pattern_evaluate(self):
        p = plan()
        rows = [bar(100 + i, 101 + i, 99 + i, 100 + i, i) for i in range(60)]
        rows[-2:] = [bar(158, 159, 156, 156.5, 58), bar(156, 161, 155.5, 160.5, 59)]
        p["flow"]["entry"] = {"id": "e", "op": "all", "children": [
            {"id": "r", "op": "rising", "left": {"kind": "sma", "period": 5}, "bars": 3},
            {"id": "p", "op": "pattern", "name": "bullishEngulfing"},
        ]}
        at = rows[-1]["time"] + 60000 - 1
        ev = engine.Evaluator(p, {"BTCUSDT:1m": rows}, at)
        self.assertTrue(ev.node(p["flow"]["entry"]))
        self.assertEqual(ev.trace["p"]["status"], "pass")
        self.assertEqual(ev.trace["r"]["status"], "pass")
        self.assertEqual(len(ev.trace["r"]["values"]), 4)


if __name__ == "__main__":
    unittest.main()
