import {cookies} from 'next/headers';
import {randomBytes} from 'node:crypto';
export const runtime='nodejs';
export async function POST(req){
 if(req.headers.get('sec-fetch-site')==='cross-site'||!['https://algoty.com','https://www.algoty.com','http://127.0.0.1:18200'].includes(req.headers.get('origin')))return new Response(null,{status:403});
 const store=await cookies();
 try{
  const raw=await req.text();if(raw.length>2000)return new Response(null,{status:413});const b=new URLSearchParams(raw);const binding=randomBytes(32).toString('base64url');
  const r=await fetch('http://127.0.0.1:18201/api/v2/google/start',{method:'POST',headers:{'Content-Type':'application/json','X-Session':store.get('algoty-session')?.value||'','X-Client-IP':req.headers.get('x-real-ip')||'local'},body:JSON.stringify({mode:b.get('mode')||'login',password:b.get('password')||'',binding}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  const data=await r.json();if(!r.ok)return Response.redirect('https://algoty.com/account?google_error='+encodeURIComponent(data.error||'Could not start Google sign-in.'),303);
  const url=new URL(data.url);if(url.origin!=='https://accounts.google.com')throw Error('Invalid provider');
  store.set('algoty-google',binding,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/auth/google',maxAge:600});
  return new Response(null,{status:303,headers:{Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return Response.redirect('https://algoty.com/account?google_error=Google%20sign-in%20is%20temporarily%20unavailable.',303)}
}
