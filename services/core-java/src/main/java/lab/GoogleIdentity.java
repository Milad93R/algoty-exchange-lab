package lab;
import java.util.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.oauth2.jwt.*;
import jakarta.annotation.PostConstruct;

@RestController
@RequestMapping("/api/v2/google")
public class GoogleIdentity {
 final Exchange e;final Identity a;final AccountSecurity security;
 final String callback="https://algoty.com/api/auth/google/callback";
 final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
 final NimbusJwtDecoder decoder=NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
 GoogleIdentity(Exchange e,Identity a,AccountSecurity security){this.e=e;this.a=a;this.security=security;}
 @PostConstruct void init(){
  e.db.execute("ALTER TABLE v2_users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE");
  e.db.execute("CREATE TABLE IF NOT EXISTS google_flows(state_hash text PRIMARY KEY,binding_hash text NOT NULL,nonce text NOT NULL,verifier text NOT NULL,session_hash text,uid text,mode text NOT NULL,expires timestamptz NOT NULL)");
 }
 String enc(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8);}
 String config(String key){String s=System.getenv(key);if(s==null||s.isBlank())throw new IllegalArgumentException("Google sign-in is unavailable.");return s;}
 @PostMapping("/start") Object start(@RequestHeader(value="X-Session",defaultValue="")String session,@RequestHeader(value="X-Client-IP",defaultValue="local")String ip,@RequestBody Map<String,String>b){
  a.throttle("google:"+ip);String mode=b.getOrDefault("mode","login"),binding=b.getOrDefault("binding","");
  if(!Set.of("login","link").contains(mode)||!binding.matches("[A-Za-z0-9_-]{43}"))throw new IllegalArgumentException("Invalid sign-in request.");
  String uid=null;try{uid=a.user(session);}catch(Exception ignored){}
  if(mode.equals("link")){uid=security.member(session);security.credentials(uid,b.get("password"));}
  else if(uid!=null&&Boolean.TRUE.equals(a.meById(uid).get("registered")))throw new IllegalArgumentException("Use Connect Google in account settings.");
  String state=a.secret(),nonce=a.secret(),verifier=a.secret();String client=config("GOOGLE_CLIENT_ID");config("GOOGLE_CLIENT_SECRET");
  String challenge;try{challenge=Base64.getUrlEncoder().withoutPadding().encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));}catch(Exception ex){throw new IllegalStateException(ex);}
  e.db.update("DELETE FROM google_flows WHERE expires<now()");
  e.db.update("INSERT INTO google_flows VALUES (?,?,?,?,?,?,?,now()+interval '10 minutes')",a.digest(state),a.digest(binding),nonce,verifier,uid==null?null:a.digest(session),uid,mode);
  return Map.of("url","https://accounts.google.com/o/oauth2/v2/auth?client_id="+enc(client)+"&redirect_uri="+enc(callback)+"&response_type=code&scope=openid%20email%20profile&prompt=select_account&state="+enc(state)+"&nonce="+enc(nonce)+"&code_challenge="+enc(challenge)+"&code_challenge_method=S256");
 }
 @PostMapping("/finish") Object finish(@RequestBody Map<String,String>b){
  String state=b.getOrDefault("state",""),binding=b.getOrDefault("binding",""),code=b.getOrDefault("code","");
  if(state.length()>100||binding.length()>100||code.length()>4000||code.isBlank())throw new IllegalArgumentException("Invalid Google callback.");
  var rows=e.db.queryForList("DELETE FROM google_flows WHERE state_hash=? AND binding_hash=? AND expires>now() RETURNING *",a.digest(state),a.digest(binding));
  if(rows.isEmpty())throw new IllegalArgumentException("Google sign-in expired. Please start again.");
  var flow=rows.get(0);
  try{
   String form="code="+enc(code)+"&client_id="+enc(config("GOOGLE_CLIENT_ID"))+"&client_secret="+enc(config("GOOGLE_CLIENT_SECRET"))+"&redirect_uri="+enc(callback)+"&grant_type=authorization_code&code_verifier="+enc((String)flow.get("verifier"));
   var req=HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token")).timeout(Duration.ofSeconds(15)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build();
   var res=http.send(req,HttpResponse.BodyHandlers.ofString());if(res.statusCode()!=200)throw new IllegalArgumentException("Google could not complete sign-in. Please try again.");
   String token=e.json.readTree(res.body()).path("id_token").asText();Jwt jwt=decoder.decode(token);
   validate(jwt,(String)flow.get("nonce"),config("GOOGLE_CLIENT_ID"));
   return complete(flow,jwt.getSubject(),jwt.getClaimAsString("email"),jwt.getClaimAsString("name"));
  }catch(IllegalArgumentException ex){throw ex;}catch(Exception ex){throw new IllegalArgumentException("Google verification failed. Please try again.");}
 }
 static void validate(Jwt jwt,String nonce,String client){
  String issuer=jwt.getClaimAsString("iss");
  if(!Set.of("https://accounts.google.com","accounts.google.com").contains(issuer)||!jwt.getAudience().contains(client)||!nonce.equals(jwt.getClaimAsString("nonce"))||!Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"))||jwt.getSubject()==null||jwt.getSubject().length()>255||jwt.getExpiresAt()==null||jwt.getExpiresAt().isBefore(java.time.Instant.now())|| (jwt.getClaimAsString("azp")!=null&&!client.equals(jwt.getClaimAsString("azp"))))throw new IllegalArgumentException("Google identity could not be verified.");
 }
 Object complete(Map<String,Object> flow,String sub,String address,String name){
  String email=address==null?"":address.toLowerCase(Locale.ROOT).strip();if(!email.matches("[^@\\s]{1,64}@[^@\\s]{1,120}\\.[^@\\s]{2,20}"))throw new IllegalArgumentException("Google did not provide a valid email.");
  return e.tx.execute(t->{e.lock();String uid=(String)flow.get("uid");
   if(uid!=null&&e.db.queryForObject("SELECT count(*) FROM v2_sessions WHERE token=? AND user_id=? AND expires>now()",Integer.class,flow.get("session_hash"),uid)!=1)throw new IllegalArgumentException("Your session changed. Please start again.");
   var linked=e.db.queryForList("SELECT id FROM v2_users WHERE google_sub=?",sub);
   if("link".equals(flow.get("mode"))){
    var own=e.db.queryForMap("SELECT email,google_sub FROM v2_users WHERE id=?",uid);
    if(!email.equals(own.get("email")))throw new IllegalArgumentException("Choose the Google account matching your AlgoTy email.");
    if(!linked.isEmpty()&&!uid.equals(linked.get(0).get("id")))throw new IllegalArgumentException("Google account already connected elsewhere.");
    if(own.get("google_sub")!=null&&!sub.equals(own.get("google_sub")))throw new IllegalArgumentException("A different Google account is already connected.");
    e.db.update("UPDATE v2_users SET google_sub=?,email_verified=true WHERE id=?",sub,uid);
   }else if(!linked.isEmpty())uid=(String)linked.get(0).get("id");
   else{
    if(e.db.queryForObject("SELECT count(*) FROM v2_users WHERE email=?",Integer.class,email)>0)throw new IllegalArgumentException("An account already uses this email. Sign in with your password, then connect Google in settings.");
    if(uid==null){if(e.db.queryForObject("SELECT count(*) FROM v2_users",Integer.class)>2000)throw new IllegalArgumentException("Account capacity reached.");uid=a.id();e.db.update("INSERT INTO v2_users(id,name) VALUES (?,?)",uid,"Trader");}
    if(Boolean.TRUE.equals(a.meById(uid).get("registered")))throw new IllegalArgumentException("Account changed. Start again.");
    String display=name==null?"Trader":name.strip();if(display.length()<2)display="Trader";if(display.length()>60)display=display.substring(0,60);
    e.db.update("UPDATE v2_users SET name=?,email=?,google_sub=?,email_verified=true WHERE id=?",display,email,sub,uid);
    e.db.update("DELETE FROM v2_sessions WHERE user_id=?",uid);
   }
   if(flow.get("session_hash")!=null)e.db.update("DELETE FROM v2_sessions WHERE token=?",flow.get("session_hash"));
   return Map.of("token",a.session(uid),"user",a.meById(uid));
  });
 }
}
