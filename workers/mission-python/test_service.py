import unittest, copy
from service import BASE, validate, bars_for, signal


class MissionTests(unittest.TestCase):
    def bars(self):
        return [
            {
                "time": i * 60000,
                "open": 100,
                "high": 101,
                "low": 99,
                "close": 100,
                "volume": 10,
                "closed": True,
            }
            for i in range(65)
        ]

    def test_schema(self):
        for key, val in [
            ("dailyTrades", 1.2),
            ("questions", [{}]),
            ("summary", {}),
            ("name", ""),
            ("stopLossPct", float("nan")),
            ("orderQuote", 3000),
            ("strategy", "EXECUTE_CODE"),
            ("symbol", "DOGEUSDT"),
        ]:
            p = {**BASE, key: val}
            with self.assertRaises(ValueError):
                validate(p)

    def test_closed_bars(self):
        b = self.bars()
        b[-1]["closed"] = False
        self.assertEqual(len(bars_for(b, "1m")), 64)
        self.assertEqual(len(bars_for(b, "5m")), 12)
        self.assertTrue(all(v["closed"] for v in bars_for(b, "5m")))

    def test_confirmation_and_volume(self):
        p = {**BASE, "confirmationBars": 2}
        b = self.bars()
        b[-1].update(close=103, high=104, volume=20)
        a, _, _ = signal(p, b, {"balances": []})
        self.assertEqual(a, "WAIT")
        b[-2].update(close=102, high=103)
        a, _, _ = signal(p, b, {"balances": []})
        self.assertEqual(a, "BUY")
        b[-1]["volume"] = 1
        self.assertEqual(signal(p, b, {"balances": []})[0], "WAIT")

    def test_position_cost_and_exit(self):
        b = self.bars()
        p = copy.deepcopy(BASE)
        portfolio = {
            "balances": [{"asset": "BTC", "total": 1000}],
            "positions": [{"symbol": "BTCUSDT", "entryPrice": 110}],
            "fills": [{"side": "BUY", "symbol": "BTCUSDT", "price": 9000}],
        }
        a, _, ev = signal(p, b, portfolio)
        self.assertEqual(a, "SELL")
        self.assertEqual(ev["entry"], 110)

    def test_ma_and_rsi(self):
        b = self.bars()
        p = {**BASE, "strategy": "MA_CROSS", "volumeRatio": 0}
        for i, r in enumerate(b):
            r["close"] = 100 + i
        self.assertEqual(signal(p, b, {"balances": []})[0], "BUY")
        p["strategy"] = "RSI_REVERSION"
        self.assertEqual(signal(p, b, {"balances": []})[0], "WAIT")
        for i, r in enumerate(b):
            r["close"] = 200 - i
        self.assertEqual(signal(p, b, {"balances": []})[0], "BUY")

    def test_runner_dispatch_and_fail_closed_review(self):
        from unittest.mock import patch
        import service

        class EndIteration(Exception):
            pass

        candles = self.bars()
        for i, row in enumerate(candles):
            row["close"] = 100 + i
        mission = {
            "id": "test-mission",
            "plan": {**BASE, "strategy": "MA_CROSS", "volumeRatio": 0},
            "last_bar": 0,
            "started_at": "1970-01-01T00:00:00Z",
            "portfolio": {"balances": []},
        }
        for answer, expected in [
            ({"allow": True, "reason": "Fixture conditions match"}, "BUY"),
            ({"allow": False, "reason": "Fixture veto"}, "WAIT"),
            ({"allow": "yes"}, "WAIT"),
            (ValueError("provider unavailable"), "WAIT"),
        ]:
            calls = []

            def transport(url, body=None, headers=None):
                if url.endswith("/work"):
                    return [mission]
                if "/market?" in url:
                    return {"stale": False, "candles": candles}
                if url.endswith("/decision"):
                    calls.append(body)
                    return {"recorded": True}
                raise AssertionError(url)

            model = (
                patch.object(service, "llm", side_effect=answer)
                if isinstance(answer, Exception)
                else patch.object(
                    service, "llm", return_value=(answer, "fixture-model")
                )
            )
            with patch.object(
                service, "request", side_effect=transport
            ), model, patch.object(service.time, "sleep", side_effect=EndIteration):
                with self.assertRaises(EndIteration):
                    service.run()
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]["action"], expected)
            self.assertEqual(calls[0]["mission"], "test-mission")
            self.assertEqual(calls[0]["bar"], candles[-1]["time"] + 59999)

    def test_runner_skips_stale_feed(self):
        from unittest.mock import patch
        import service

        class EndIteration(Exception):
            pass

        mission = {"id": "stale", "plan": BASE}

        def transport(url, body=None, headers=None):
            if url.endswith("/work"):
                return [mission]
            if "/market?" in url:
                return {"stale": True}
            raise AssertionError("Stale feed dispatched a decision")

        with patch.object(
            service, "request", side_effect=transport
        ) as request, patch.object(service, "llm") as model, patch.object(
            service.time, "sleep", side_effect=EndIteration
        ):
            with self.assertRaises(EndIteration):
                service.run()
            self.assertEqual(request.call_count, 2)
            model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
