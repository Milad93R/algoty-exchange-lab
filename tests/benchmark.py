from integration import *
import statistics,platform
s=call('/api/session',{})['session'];wait(s);latencies=[];start=time.perf_counter()
for i in range(80):
 t=time.perf_counter();order(s,'BUY' if i%2==0 else 'SELL',6010000 if i%2==0 else 6000000,1);latencies.append((time.perf_counter()-t)*1000)
d=wait(s);elapsed=time.perf_counter()-start
assert len(d['trades'])==80 and d['balanced']
a=sorted(latencies)
print(json.dumps({'orders':80,'concurrency':1,'api_acceptance_ms':{'p50':statistics.median(a),'p95':a[int(len(a)*.95)-1],'max':max(a)},'all_settled_seconds':elapsed,'settled_orders_per_second':80/elapsed,'correctness':{'trades':len(d['trades']),'balanced':d['balanced']},'environment':'shared yusam host; loopback; durable full-snapshot matcher; Java global transaction lock','scope':'small smoke benchmark, not capacity or production latency claim'},indent=2))
