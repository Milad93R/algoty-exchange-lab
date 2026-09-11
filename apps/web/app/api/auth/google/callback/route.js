import {cookies} from 'next/headers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req){
 const store=await cookies();const binding=store.get('algoty-google')?.value;store.set('algoty-google','',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/auth/google',maxAge:0});
 let target='https://algoty.com/account';
 try{
  const q=new URL(req.url).searchParams;
  if(q.has('error'))throw Error('Google sign-in was cancelled. You can try again.');
  if(!binding||!q.get('state')||!q.get('code'))throw Error('Google sign-in expired. Please start again.');
  const r=await fetch('http://127.0.0.1:18201/api/v2/google/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({binding,state:q.get('state'),code:q.get('code')}),cache:'no-store',signal:AbortSignal.timeout(30000)});
  const d=await r.json();if(!r.ok||!d.token)throw Error(d.error||'Google sign-in could not be completed.');
  store.set('algoty-session',d.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:604800});
 }catch(e){target+='?google_error='+encodeURIComponent(e.message?.slice(0,250)||'Google sign-in failed.')}
 return new Response(null,{status:303,headers:{Location:target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
