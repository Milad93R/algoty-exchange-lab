import {visitMessage} from './message.mjs';
import {isIP} from 'node:net';
export const runtime='nodejs';
const visits=new Map();
let destination;
const response=(status=200)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request){
  const origin=request.headers.get('origin');
  if(!['https://algoty.com','https://www.algoty.com','http://127.0.0.1:18200','http://localhost:18200'].includes(origin))return response(403);
  const token=process.env.TELEGRAM_BOT_TOKEN;
  const chatId=process.env.TELEGRAM_CHAT_ID;
  if(!token||!/^\d+$/.test(chatId||''))return response(503);
  let page;
  try{
    const raw=await request.text();
    if(raw.length>1024)return response(413);
    page=JSON.parse(raw).page;
    if(typeof page!=='string'||!/^\/[a-zA-Z0-9/_-]*$/.test(page)||page.length>160)return response(400);
  }catch{return response(400)}
  const now=Date.now();
  const candidate=request.headers.get('x-real-ip')||'';
  const ip=isIP(candidate)?candidate:'Unknown';
  const ua=(request.headers.get('user-agent')||'Unknown').slice(0,200);
  const key=ip+'|'+ua;
  for(const [k,time]of visits)if(now-time>30000)visits.delete(k);
  if(visits.has(key))return response(204);
  if(visits.size>=5000)return response(429);
  visits.set(key,now);
  async function telegram(method,body){
    const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(5000),cache:'no-store',
    });
    const data=await r.json();
    if(!r.ok||!data.ok)throw Error('Telegram delivery unavailable');
    return data.result;
  }
  try{
    // Never send visit notifications to a group or channel.
    if(destination!==token+':'+chatId){
      const chat=await telegram('getChat',{chat_id:chatId});
      if(chat.type!=='private')return response(503);
      destination=token+':'+chatId;
    }
    await telegram('sendMessage',{chat_id:chatId,text:await visitMessage(ip,ua,page),parse_mode:'HTML'});
    return response(204);
  }catch{
    visits.delete(key);
    console.error('AlgoTy visit notification delivery failed');
    return response(502);
  }
}
