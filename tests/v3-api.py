import json,urllib.request,urllib.error,time,sys,os,pathlib,copy
sys.path.insert(0,'workers/mission-python')
from service import BASE
from test_engine import plan
checks=[]
def req(path,b=None,t='',expected=200,internal=False):
 headers={'Content-Type':'application/json','X-Session':t}
 if internal:headers['X-Worker-Token']=worker
 r=urllib.request.Request('http://127.0.0.1:18201/api/v2/'+path,data=json.dumps(b).encode() if b is not None else None,headers=headers)
 try:
  with urllib.request.urlopen(r,timeout=60) as x:code=x.status;d=json.load(x)
 except urllib.error.HTTPError as x:code=x.code;d=json.load(x)
 assert code==expected,(path,code,d)
 return d
worker=''
for l in pathlib.Path('.runtime/ai.env').read_text().splitlines():
 if l.startswith('AI_INTERNAL_TOKEN='):worker=l.split('=',1)[1].strip().strip("'\"")
for _ in range(30):
 try:
  t=req('session',{})['token'];break
 except urllib.error.URLError:time.sleep(1)
other=req('session',{})['token'];p=plan();p['name']='QA composable execution';p['flow']['risk'].update(maxEntries=2,exitPercent=25,cooldownBars=0)
p['flow']['entry']['right']=1e8 # prevent autonomous entries in manual risk test
m=req('missions/manual',p,t);mid=m['id']
try:
 req('missions/'+mid,t=other,expected=400);req('missions/'+mid+'/replay',{},other,400)
 bad=copy.deepcopy(p);bad['flow']['entry']['op']='exec';req('missions/manual',bad,t,400)
 checks.append('flow validation and cross-user isolation')
 replay=req('missions/'+mid+'/replay',{'slippageBps':5},t)
 assert replay['bars']>200 and len(replay['events'])==replay['bars'] and replay['fills']==0
 checks.append('real Binance historical replay and per-node trace')
 req('missions/'+mid+'/control',{'action':'activate'},t)
 def decide(action,protect=False):
  return req('internal/decision',{'mission':mid,'bar':int(time.time()*1000)-1,'action':action,'message':'QA internal risk check','evidence':{'protectiveExit':protect,'nextState':{'peak':1}}},internal=True)
 def settled():
  for _ in range(20):
   d=req('missions/'+mid,t=t)
   if not any(o['status'] in ('OPEN','PARTIAL') for o in d['portfolio']['orders']):return d
   time.sleep(.5)
  raise AssertionError('Settlement timeout')
 assert 'order' in decide('BUY');settled();time.sleep(.02)
 assert 'order' in decide('BUY');d=settled();time.sleep(.02)
 assert decide('BUY').get('blocked');checks.append('Java scale-in cap enforced')
 before=sum(x['total'] for x in d['portfolio']['balances'] if x['asset']=='BTC')
 time.sleep(.02);assert 'order' in decide('SELL');d=settled()
 after=sum(x['total'] for x in d['portfolio']['balances'] if x['asset']=='BTC')
 assert abs(after-before*.75)<=1 and d['portfolio']['balanced'];checks.append('25 percent partial exit and balanced ledger')
 time.sleep(.02);assert 'order' in decide('SELL',True);d=settled()
 assert sum(x['total'] for x in d['portfolio']['balances'] if x['asset']=='BTC')==0;checks.append('protective exit closes entire position')
 variant=req('missions/'+mid+'/edit',p,t);assert variant['id']!=mid and variant['status']=='DRAFT';checks.append('editing active flow creates inactive version')
finally:req('missions/'+mid+'/control',{'action':'stop'},t)
# One genuine AI composition, not a deterministic canned result.
ai=req('missions',{'brief':'For BTC, enter when its 1m close is above EMA20 AND ETH 15m RSI14 is above 50. Exit 25 percent when BTC close falls below EMA20. Keep a full protective 2 percent stop. Use a composable flow with $100 entries, at most two entries per position.'},t)
assert ai['plan']['strategy']=='CUSTOM' and ai['plan']['flow']['risk']['exitPercent']==25
checks.append('actual AI provider generated composable multi-market plan')
pathlib.Path('docs/v3/evidence/api.json').write_text(json.dumps({'checks':checks,'replayBars':replay['bars'],'aiModel':ai['plan'].get('model')},indent=2))
print(json.dumps(checks))
