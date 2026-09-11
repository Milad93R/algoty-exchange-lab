import unittest, copy
import engine, studio
from service import BASE, validate


def rule(id="entry", op="gt", left=None, right=100):
    return dict(id=id, op=op, left=left or {"kind": "close"}, right=right)


def plan():
    return {
        **BASE,
        "strategy": "CUSTOM",
        "flow": {
            "version": 1,
            "entry": rule(),
            "exit": rule("exit", "lt", right=90),
            "risk": {**engine.DEFAULT_RISK},
        },
    }


def candles(n=500):
    return [
        dict(
            time=i * 60000,
            open=100 + i * 0.1,
            high=101 + i * 0.1,
            low=99 + i * 0.1,
            close=100 + i * 0.1,
            volume=100,
            closed=True,
        )
        for i in range(n)
    ]


class EngineTest(unittest.TestCase):
    def test_validation(self):
        p = plan()
        validate(p)
        for change in [
            lambda f: f["entry"].update(op="exec"),
            lambda f: f["entry"].update(id="exit"),
            lambda f: f["risk"].update(maxEntries=9),
            lambda f: f["entry"].update(right=float("nan")),
            lambda f: f["entry"].update(left={"kind": "sma", "period": 1}),
            lambda f: f["entry"].update(left={"kind": "close", "symbol": "DOGEUSDT"}),
        ]:
            f = copy.deepcopy(p["flow"])
            change(f)
            with self.assertRaises(ValueError):
                engine.validate(f)

    def test_no_future(self):
        p = plan()
        rs = candles()
        ctx = {"BTCUSDT:1m": rs}
        at = 100 * 60000 - 1
        a = engine.Evaluator(p, ctx, at).node(p["flow"]["entry"])
        rs[100]["close"] = 1e8
        self.assertEqual(a, engine.Evaluator(p, ctx, at).node(p["flow"]["entry"]))
        p["flow"]["entry"]["left"] = {"kind": "close", "timeframe": "5m"}
        ctx["BTCUSDT:5m"] = [dict(rs[0], time=0, close=42)]
        self.assertIsNone(engine.Evaluator(p, ctx, 299998).node(p["flow"]["entry"]))
        self.assertFalse(engine.Evaluator(p, ctx, 299999).node(p["flow"]["entry"]))

    def test_indicators(self):
        p = plan()
        rs = candles()
        e = engine.Evaluator(p, {"BTCUSDT:1m": rs}, 500 * 60000 - 1)
        self.assertAlmostEqual(e.value({"kind": "sma", "period": 20}, e.at), 148.95)
        self.assertEqual(e.value({"kind": "rsi", "period": 14}, e.at), 100)
        self.assertEqual(e.value({"kind": "atr", "period": 14}, e.at), 2)
        self.assertEqual(e.value({"kind": "volumeRatio", "period": 20}, e.at), 1)
        self.assertAlmostEqual(
            e.value({"kind": "highest", "period": 20, "offset": 1}, e.at), 150.8
        )

    def test_cross_confirm_sequence(self):
        p = plan()
        ctx = {"BTCUSDT:1m": candles()}
        e = engine.Evaluator(p, ctx, 102 * 60000 - 1)
        cross = rule(op="crossAbove", right=110)
        self.assertTrue(e.node(cross))
        self.assertFalse(e.node(cross, e.at + 60000))
        node = {"id": "c", "op": "consecutive", "bars": 3, "child": rule(right=109)}
        self.assertTrue(e.node(node))
        seq = {
            "id": "s",
            "op": "sequence",
            "within": 3,
            "children": [rule("a", "lt", right=110), cross],
        }
        self.assertTrue(e.node(seq))
        self.assertFalse(
            e.node(
                {
                    "id": "s",
                    "op": "sequence",
                    "within": 3,
                    "children": [rule("a", right=200), cross],
                }
            )
        )

    def test_temporal_budget(self):
        p = plan()
        n = rule()
        for i in range(4):
            n = {"id": "c" + str(i), "op": "consecutive", "bars": 10, "child": n}
        p["flow"]["entry"] = n
        with self.assertRaises(ValueError):
            validate(p)

    def test_actions_protection_partial(self):
        p = plan()
        p["flow"]["exit"] = rule("exit", right=120)
        p["flow"]["risk"]["exitPercent"] = 25
        ctx = {"BTCUSDT:1m": candles()}
        at = 500 * 60000 - 1
        portfolio = {
            "balances": [{"asset": "BTC", "total": 1000000}],
            "positions": [{"symbol": "BTCUSDT", "entryPrice": 149}],
            "fills": [],
        }
        a, _, e = engine.evaluate(p, ctx, portfolio, at)
        self.assertEqual(a, "SELL")
        self.assertEqual(e["exitPercent"], 25)
        portfolio["positions"][0]["entryPrice"] = 100
        a, _, e = engine.evaluate(p, ctx, portfolio, at)
        self.assertTrue(e["protectiveExit"])
        self.assertEqual(e["exitPercent"], 100)

    def test_persisted_trailing_peak(self):
        p=plan();p['flow']['risk']['trailingPct']=2
        portfolio={'balances':[{'asset':'BTC','total':1000000}], 'positions':[{'symbol':'BTCUSDT','entryPrice':149}], 'fills':[], '_flowState':{'peak':200}}
        action,_,ev=engine.evaluate(p,{'BTCUSDT:1m':candles()},portfolio,500*60000-1)
        self.assertEqual(action,'SELL');self.assertTrue(ev['protectiveExit']);self.assertEqual(ev['nextState']['peak'],200)

    def test_replay_timing_costs(self):
        p = plan()
        ctx = {"BTCUSDT:1m": candles()}
        r = studio.replay(p, ctx)
        fills = [e for e in r["events"] if e["fill"]]
        self.assertTrue(fills)
        self.assertGreater(r["fees"], 0)
        self.assertGreater(fills[0]["fill"]["created_at"], fills[0]["time"])
        self.assertAlmostEqual(
            fills[0]["fill"]["price"] / 100,
            ctx["BTCUSDT:1m"][221]["open"] * 1.0005,
            places=2,
        )
        self.assertTrue(all(x["equity"] > 0 for x in r["curve"]))

    def test_warmup_and_schedule(self):
        p = plan()
        e = engine.Evaluator(p, {"BTCUSDT:1m": candles(2)}, 119999)
        self.assertIsNone(e.node(rule(left={"kind": "sma", "period": 20})))
        self.assertTrue(
            e.node({"id": "s", "op": "schedule", "startHour": 23, "endHour": 2})
        )


if __name__ == "__main__":
    unittest.main()
