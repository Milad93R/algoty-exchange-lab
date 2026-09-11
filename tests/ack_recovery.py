from integration import *
s=call('/api/session',{})['session'];wait(s)
subprocess.run(['pm2','stop','exchange-lab-matching'],check=True,stdout=subprocess.DEVNULL)
try:
    o=order(s,'BUY',6010000,3)
    subprocess.run(['pm2','stop','exchange-lab-core'],check=True,stdout=subprocess.DEVNULL)
    # Read only the command created by this test, never credentials or other sessions.
    payload=subprocess.check_output(['docker','exec','exchange-lab-postgres','psql','-U','exchange','-d','exchange','-Atc',"SELECT payload FROM outbox WHERE id='"+o['id']+"'"],text=True).strip()
    subprocess.run(['pm2','restart','exchange-lab-matching'],check=True,stdout=subprocess.DEVNULL)
    time.sleep(1)
    req=urllib.request.Request('http://127.0.0.1:18202/command',data=payload.encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r:result=json.load(r)
    assert len(result['trades'])==1
    # Java has not received the response. Restart matcher, then let Java redeliver.
    subprocess.run(['pm2','restart','exchange-lab-matching'],check=True,stdout=subprocess.DEVNULL)
finally:
    subprocess.run(['pm2','restart','exchange-lab-matching'],stdout=subprocess.DEVNULL)
    subprocess.run(['pm2','restart','exchange-lab-core'],stdout=subprocess.DEVNULL)
for _ in range(40):
    try:d=wait(s);break
    except (OSError,urllib.error.URLError):time.sleep(1)
else:raise AssertionError('core did not recover')
assert len(d['trades'])==1 and d['balances']['base']==1003 and d['balances']['quote']==1000000000-6010000*3 and d['balanced']
print(json.dumps({'passed':'persisted matching response before Java settlement; restart both; exactly one debit','trade_count':len(d['trades'])}))
