"""Offline research worker. Fixed parameters; prior-bar signals, next close execution.
Public market data is cached with a SHA256; no live trading is performed.
"""
import csv,json,math,hashlib,argparse,os,urllib.request,time
from pathlib import Path
from datetime import datetime,timezone

def evaluate(prices, fee=0.001, slippage=0.0005):
    cash=10000.;units=0.;peak=cash;dd=0.;curve=[];fills=[]
    for i,price in enumerate(prices):
        if i>=20:
            signal=sum(prices[i-5:i])/5 > sum(prices[i-20:i])/20
            if signal and units==0:
                execution=price*(1+slippage);units=cash/(execution*(1+fee));cash=0.;fills.append({'bar':i,'side':'BUY','price':execution})
            elif not signal and units>0:
                execution=price*(1-slippage);cash=units*execution*(1-fee);units=0.;fills.append({'bar':i,'side':'SELL','price':execution})
        equity=cash+units*price;peak=max(peak,equity);dd=max(dd,1-equity/peak);curve.append(equity)
    if units:
        cash=units*prices[-1]*(1-slippage)*(1-fee);curve[-1]=cash;dd=max(dd,1-cash/peak);fills.append({'bar':len(prices)-1,'side':'LIQUIDATE','price':prices[-1]*(1-slippage)})
    bh=(prices[-1]*(1-slippage)*(1-fee))/(prices[0]*(1+slippage)*(1+fee))-1
    return {'return_pct':(curve[-1]/10000-1)*100,'buy_hold_pct':bh*100,'max_drawdown_pct':dd*100,'fills':len(fills)},curve,fills

def get_json(url):
    with urllib.request.urlopen(url,timeout=30) as r:return json.load(r)
def add_llm(report,keyfile):
    key=os.environ.get('OPENROUTER_API_KEY')
    if not key and keyfile:
        for line in Path(keyfile).read_text().splitlines():
            if line.startswith('OPENROUTER_API_KEY='):key=line.split('=',1)[1].strip().strip('"\'')
    if not key:raise ValueError('OPENROUTER_API_KEY is required for --llm')
    evidence={'source':report['source'],'metrics':report['metrics'],'holdout_metrics':report['holdout_metrics'],'assumptions':report['assumptions']}
    body={'model':os.getenv('RESEARCH_MODEL','openai/gpt-4.1-mini'),'max_tokens':500,'temperature':0,'response_format':{'type':'json_object'},'messages':[{'role':'system','content':'You explain a historical research run, never give trading recommendations. Return JSON {"observations":[{"text":"...","evidence":["metrics.return_pct"]}]}. Exactly three short observations. Cite only paths from the supplied metrics or holdout_metrics. Do not infer causation, promise profitability, invent metrics or recommend investment. Include the short-sample limitation. Source is public or synthetic as marked. Parameters were fixed, not optimized. metrics is the FULL sample including holdout, NOT an in-sample or training period. Say full-sample. One observation must mention that the sample is short and cannot establish future profitability.'},{'role':'user','content':json.dumps(evidence)}]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/chat/completions',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=45) as r:response=json.load(r)
    parsed=json.loads(response['choices'][0]['message']['content']);allowed={section+'.'+k for section in ['metrics','holdout_metrics'] for k in report[section]}
    assert len(parsed['observations'])==3
    for obs in parsed['observations']:
        assert obs['text'] and obs['evidence'] and set(obs['evidence'])<=allowed
        assert 'in-sample' not in obs['text'].lower() and 'training' not in obs['text'].lower()
    report['ai']={'model':response['model'],'observations':parsed['observations'],'evidence_paths_validated':True,'text_requires_human_review':True};report['llm_enabled']=True

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--csv');p.add_argument('--binance',action='store_true');p.add_argument('--llm',action='store_true');p.add_argument('--key-env-file');p.add_argument('--out',default=str(Path(__file__).with_name('report.json')));a=p.parse_args()
    source='synthetic_fixture';bars=[]
    if a.binance:
        source='Binance BTCUSDT 1h';rows=get_json('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000');bars=[{'time':r[0],'close':float(r[4])} for r in rows if r[6]<time.time()*1000];prices=[b['close'] for b in bars]
    elif a.csv:source='user_csv';prices=[float(r['close']) for r in csv.DictReader(open(a.csv))]
    else:prices=[60000+80*i+2200*math.sin(i/12) for i in range(240)]
    if len(prices)<80 or any(not math.isfinite(x) or x<=0 for x in prices):raise ValueError('Need at least 80 positive finite close prices')
    metrics,curve,fills=evaluate(prices);split=int(len(prices)*.7);holdout,_,_=evaluate(prices[split:])
    report={'source':source,'created_at':datetime.now(timezone.utc).isoformat(),'input_sha256':hashlib.sha256(json.dumps(prices).encode()).hexdigest(),'prices':prices,'bars':bars,'metrics':metrics,'holdout_metrics':holdout,'holdout_start_index':split,'equity':curve,'fills':fills,'assumptions':{'fast':5,'slow':20,'fee_per_fill':.001,'slippage_per_fill':.0005,'execution':'prior-bar signal; next bar close; full fills','holdout':'last 30%; independent cash reset and 20-bar warmup; fixed parameters; no tuning','order_book':'not reconstructed; independent bar simulator'},'analysis':f"Fixed moving-average baseline produced {metrics['fills']} fills. Fees and slippage apply to strategy and buy-and-hold; final positions are liquidated. This short sample is not evidence of future profitability.",'llm_enabled':False}
    if a.llm:add_llm(report,a.key_env_file)
    out=Path(a.out);tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(report,indent=2));tmp.replace(out);print(json.dumps({'source':source,'metrics':metrics,'llm_enabled':report['llm_enabled']}))
