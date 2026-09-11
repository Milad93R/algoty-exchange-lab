import sys,json,time,urllib.request,pathlib
sys.path.insert(0,'workers/mission-python')
from test_engine import plan

def req(path,b=None,t=''):
 r=urllib.request.Request('http://127.0.0.1:18201/api/v2/'+path,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json','X-Session':t})
 with urllib.request.urlopen(r,timeout=60) as x:return json.load(x)
t=req('session',{})['token'];p=plan();p['name']='QA live flow observer';p['flow']['entry']['right']=0;p['flow']['exit']['right']=0;p.update(orderQuote=10,maxPositionQuote=10,stopLossPct=20,takeProfitPct=50)
m=req('missions/manual',p,t);mid=m['id']
try:
 req('missions/'+mid+'/control',{'action':'activate'},t)
 for _ in range(45):
  d=req('missions/'+mid,t=t)
  if d['portfolio']['fills'] and any(e['kind']=='ORDER' for e in d['events']):break
  time.sleep(2)
 else:raise AssertionError('No autonomous closed-bar execution within 90 seconds')
 order=next(e for e in d['events'] if e['kind']=='ORDER');ev=json.loads(order['evidence'])
 assert ev['signal']['trace']['entry']['status']=='pass'
 assert d['portfolio']['balanced']
 pathlib.Path('docs/v3/evidence/live.json').write_text(json.dumps({'autonomousWorker':True,'closedBar':ev['signal']['barTime'],'trace':ev['signal']['trace'],'fills':len(d['portfolio']['fills']),'ledgerBalanced':True,'source':'Live Binance book; QA condition close > 0 intentionally triggers a virtual entry, not a profitable strategy claim'},indent=2))
 print('Autonomous flow + live book fill verified')
finally:req('missions/'+mid+'/control',{'action':'stop'},t)
