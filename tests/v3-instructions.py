import json,pathlib,urllib.request
qa=json.loads(pathlib.Path('.runtime/v3-browser.json').read_text());token=next(c['value'] for c in qa['cookies'] if c['name']=='algoty-session');mid=qa['mission']
def req(path,b=None):
 r=urllib.request.Request('http://127.0.0.1:18201/api/v2/missions/'+mid+path,data=json.dumps(b).encode() if b is not None else None,headers={'Content-Type':'application/json','X-Session':token})
 with urllib.request.urlopen(r,timeout=60) as x:return json.load(x)
before=req('')['plan']
r=req('/instruction',{'instruction':'Change ONLY maxEntries to 3 and cooldownBars to 5 in the flow risk. Keep the rest of the plan exactly unchanged.'})
assert r['action']=='edit' and r['plan']['flow']['risk']['maxEntries']==3 and r['plan']['flow']['risk']['cooldownBars']==5
assert req('')['plan']==before
unsupported=req('/instruction',{'instruction':'Change this into an automated short-selling strategy using 10x leverage on DOGE and live news sentiment.'})
assert unsupported['action']=='clarify'
pathlib.Path('docs/v3/evidence/instructions.json').write_text(json.dumps({'actualAIEditPreview':True,'unchangedUntilSave':True,'unsupportedClarified':True,'model':r.get('model')},indent=2))
print('AI edit preview and unsupported clarification passed')
