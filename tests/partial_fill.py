from integration import *
s=call('/api/session',{})['session'];wait(s)
o=order(s,'BUY',6010000,150);d=wait(s)
row=next(x for x in d['orders'] if x['id']==o['id'])
assert row['status']=='PARTIAL' and row['remaining']==50
assert d['balances']['base']==1100 and d['balances']['quote']==399000000 and d['balances']['reserved_quote']==300500000
call('/api/cancel/'+o['id'],{},s);d=wait(s)
assert d['balances']['reserved_quote']==0 and d['balances']['quote']==399000000 and d['balanced']
print(json.dumps({'passed':'partial fill followed by cancel releases only the unfilled reservation'}))
