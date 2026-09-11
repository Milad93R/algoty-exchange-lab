"""Runs against isolated sandbox sessions; only restarts exchange-lab-matching."""
import json,time,urllib.request,urllib.error,uuid,subprocess,concurrent.futures
BASE='http://127.0.0.1:18201'
def call(path,body=None,s=None):
    headers={'Content-Type':'application/json'}
    if s:headers['X-Session']=s
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
def wait(s):
    for _ in range(100):
        d=call('/api/state',s=s)
        if d['pending']==0:return d
        time.sleep(.15)
    raise AssertionError('outbox did not drain')
def order(s,side,price,q,key=None):return call('/api/orders',{'side':side,'price':price,'quantity':q,'key':key or str(uuid.uuid4())},s)
def main():
 s=call('/api/session',{})['session'];d=wait(s);assert len(d['book'])==10 and d['balanced'];initial=d['balances'];checks=[]
 key=str(uuid.uuid4());o=order(s,'BUY',6010000,10,key);order(s,'BUY',6010000,10,key);d=wait(s);assert len(d['trades'])==1 and d['balances']['base']==1010 and d['balances']['quote']==initial['quote']-60100000;checks.append('duplicate request: single trade and single debit')
 try:order(s,'BUY',6020000,10,key);raise AssertionError('conflict accepted')
 except urllib.error.HTTPError as e:assert e.code==400
 # Price improvement: execute at maker price, release full limit reservation.
 order(s,'BUY',6030000,10);d=wait(s);assert d['balances']['reserved_quote']==0;assert d['trades'][0]['price']==6010000;checks.append('maker-price execution and reservation release')
 # Resting order and cancel.
 o=order(s,'BUY',5900000,5);d=wait(s);assert d['balances']['reserved_quote']==29500000;call('/api/cancel/'+o['id'],{},s);call('/api/cancel/'+o['id'],{},s);d=wait(s);assert d['balances']['reserved_quote']==0;checks.append('idempotent cancellation')
 # Insufficient funds cannot enter outbox.
 try:order(s,'BUY',99999999,1000000);raise AssertionError('overspend accepted')
 except urllib.error.HTTPError as e:assert e.code==400
 checks.append('overspend rejected')
 # Concurrent reservation requests cannot overdraw.
 def reserve(_):
  try:order(s,'BUY',5900000,100);return True
  except urllib.error.HTTPError as e:assert e.code==400;return False
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(reserve,range(4)))
 d=wait(s);assert sum(results)==1;assert d['balances']['quote']>=d['balances']['reserved_quote'];checks.append('concurrent reservations protected')
 for o in d['orders']:
  if o['remaining']>0:call('/api/cancel/'+o['id'],{},s)
 wait(s)
 # Persist an accepted order while engine unavailable; recover then retry same key.
 subprocess.run(['pm2','stop','exchange-lab-matching'],check=True,stdout=subprocess.DEVNULL)
 key=str(uuid.uuid4())
 try:
  o=order(s,'SELL',6000000,5,key);d=call('/api/state',s=s);assert d['pending']>0
 finally:subprocess.run(['pm2','restart','exchange-lab-matching'],check=True,stdout=subprocess.DEVNULL)
 d=wait(s);count=len(d['trades']);order(s,'SELL',6000000,5,key);d=wait(s);assert len(d['trades'])==count;assert d['balanced'];checks.append('durable pending order across matcher outage')
 s2=call('/api/session',{})['session'];other=wait(s2);assert not other['trades'];assert other['balances']['base']==1000;checks.append('session isolation')
 # Independent ledger reconstruction of user balances from all entries in this short session.
 for asset,field in [('BTC','base'),('USD','quote')]:assert sum(x['amount'] for x in d['ledger'] if x['asset']==asset)==d['balances'][field]
 checks.append('ledger reconstruction equals balances')
 print(json.dumps({'passed':checks,'session':s},indent=2))
if __name__=='__main__':main()
