"""Integration checks against local core. Creates and removes only its own QA user."""
import requests,subprocess,uuid,hashlib,json,os
from pathlib import Path
B='http://127.0.0.1:18201/api/v2/'
tag=uuid.uuid4().hex; email='security-'+tag+'@example.invalid'; pwd='Good-password-'+tag; uid=None

def sql(q):return subprocess.check_output(['docker','exec','exchange-lab-postgres','psql','-U','exchange','-d','exchange','-tAc',q],text=True).strip()
def call(path,b=None,token=None):return requests.request('GET' if b is None else 'POST',B+path,json=b,headers={'X-Session':token or '', 'X-Client-IP':'qa-'+tag},timeout=20)
def challenge(purpose='register',address=None):
 c=uuid.uuid4().hex;h=hashlib.sha256((c+':123456').encode()).hexdigest();owner="NULL" if purpose=='register' else "'%s'"%uid;cred='NULL' if purpose=='register' else "(SELECT hash FROM v2_users WHERE id='%s')"%uid
 sql("INSERT INTO email_challenges(id,email,code_hash,expires,purpose,owner_id,credential_hash) VALUES ('%s','%s','%s',now()+interval '15 minutes','%s',%s,%s)"%(c,address or email,h,purpose,owner,cred));return c
try:
 guest=call('session',{}).json();uid=guest['user']['id'];t=guest['token'];c=challenge();r=call('register',{'email':email,'name':'Security QA','password':pwd,'challenge':c,'emailCode':'123456'},t);assert r.ok,r.text;t=r.json()['token']
 assert call('account/profile',{'name':'Updated QA'},t).json()['user']['name']=='Updated QA'
 t2=call('login',{'email':email,'password':pwd}).json()['token'];rows=call('account/sessions',token=t).json();assert len(rows)==2 and sum(x['current'] for x in rows)==1
 other=next(x['id'] for x in rows if not x['current']);assert all('token' not in x for x in rows)
 call('account/sessions/revoke',{'id':other},t);assert not call('me',token=t2).ok
 t2=call('login',{'email':email,'password':pwd}).json()['token'];call('account/sessions/revoke',{'id':'others'},t);assert not call('me',token=t2).ok
 assert not call('account/password',{'currentPassword':'wrong','password':'new-password-123'},t).ok
 c=challenge('reset');assert not call('register',{'email':email,'name':'QA','password':pwd,'challenge':c,'emailCode':'123456'}).ok
 r=call('account/password',{'currentPassword':pwd,'password':'new-password-123'},t);assert r.ok,r.text;old=t;t=r.json()['token'];pwd='new-password-123';assert not call('me',token=old).ok
 assert not call('account/reset',{'email':email,'challenge':c,'emailCode':'123456','password':'next-password-123'}).ok
 c=challenge('reset');b={'email':email,'challenge':c,'emailCode':'000000','password':'reset-password-123'};assert not call('account/reset',b).ok;assert sql("SELECT attempts FROM email_challenges WHERE id='%s'"%c)=='1';b['emailCode']='123456';r=call('account/reset',b);assert r.ok,r.text;assert not call('me',token=t).ok;t=r.json()['token'];pwd=b['password'];assert not call('account/reset',b).ok
 new='changed-'+tag+'@example.invalid';c=challenge('change-email',new);b={'email':new,'challenge':c,'emailCode':'123456','currentPassword':pwd};assert not call('account/reset',{**b,'password':'should-not-work-123'}).ok
 r=call('account/email',b,t);assert r.ok,r.text;assert not call('me',token=t).ok;t=r.json()['token'];assert r.json()['user']['email']==new;assert r.json()['user']['email_verified'];assert not call('account/email',b,t).ok
 assert not call('login',{'email':email,'password':pwd}).ok;assert call('login',{'email':new,'password':pwd}).ok
 assert call('account/forgot',{'email':'absent-'+tag+'@example.invalid'}).ok
 subprocess.run(['node','tests/account-browser.cjs'],env={**os.environ,'QA_SESSION':t,'QA_PASSWORD':pwd},check=True)
 print('PASS: profile, sessions, revoke one/all, password reauthentication, rotation, reset, one-use codes, purpose isolation, email change, old email invalidation.')
finally:
 if uid:sql("DELETE FROM email_challenges WHERE owner_id='%s' OR email='%s'; DELETE FROM v2_sessions WHERE user_id='%s'; DELETE FROM v2_users WHERE id='%s'"%(uid,email,uid,uid))
