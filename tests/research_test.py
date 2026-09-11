import importlib.util,unittest,math
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'workers/research-python/run.py'
s=importlib.util.spec_from_file_location('research',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ResearchTests(unittest.TestCase):
 def test_future_does_not_change_past(self):
  a=[100+i*.1+4*math.sin(i/5) for i in range(200)];b=a[:100]+[v*3 for v in a[100:]]
  self.assertEqual(m.evaluate(a)[1][:100],m.evaluate(b)[1][:100])
 def test_constant_prices_no_signal(self):
  metrics,curve,fills=m.evaluate([100.]*100)
  self.assertEqual(fills,[]);self.assertEqual(metrics['return_pct'],0)
 def test_costs_reduce_return(self):
  a=[100+i*.2+4*math.sin(i/5) for i in range(200)]
  self.assertLess(m.evaluate(a)[0]['return_pct'],m.evaluate(a,fee=0,slippage=0)[0]['return_pct'])
if __name__=='__main__':unittest.main()
