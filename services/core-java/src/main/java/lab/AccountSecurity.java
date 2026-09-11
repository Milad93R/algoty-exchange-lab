package lab;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import jakarta.annotation.PostConstruct;

@RestController
@RequestMapping("/api/v2/account")
public class AccountSecurity {
 final Exchange e; final Identity a; final EmailVerification mail;
 AccountSecurity(Exchange e,Identity a,EmailVerification mail){this.e=e;this.a=a;this.mail=mail;}
 @PostConstruct void init(){
  e.db.execute("ALTER TABLE v2_sessions ADD COLUMN IF NOT EXISTS public_id text NOT NULL DEFAULT gen_random_uuid()::text");
  e.db.execute("ALTER TABLE v2_sessions ADD COLUMN IF NOT EXISTS created timestamptz NOT NULL DEFAULT now()");
 }
 String member(String s){String u=a.user(s);if(!Boolean.TRUE.equals(a.meById(u).get("registered")))throw new IllegalArgumentException("Create an account first.");return u;}
 Map<String,Object> credentials(String uid,String pass){
  var row=e.db.queryForMap("SELECT * FROM v2_users WHERE id=?",uid);
  if(row.get("hash")==null)throw new IllegalArgumentException("Set a password using email recovery first.");
  if(pass==null||pass.length()>128||!a.same(a.hash(pass,(String)row.get("salt")),(String)row.get("hash")))throw new IllegalArgumentException("Current password is incorrect.");
  return row;
 }
 String normalized(Map<String,String>b){return b.getOrDefault("email","").strip().toLowerCase(Locale.ROOT);}
 Map<String,Object> rotate(String uid,String pass){
  a.password(pass);String salt=Base64.getEncoder().encodeToString(a.random.generateSeed(16)),recovery=a.secret();
  e.db.update("UPDATE v2_users SET hash=?,salt=?,recovery_hash=? WHERE id=?",a.hash(pass,salt),salt,a.digest(recovery),uid);
  e.db.update("DELETE FROM v2_sessions WHERE user_id=?",uid);
  e.db.update("DELETE FROM email_challenges WHERE owner_id=?",uid);
  return Map.of("token",a.session(uid),"user",a.meById(uid),"recoveryCode",recovery);
 }
 @PostMapping("/profile") Object profile(@RequestHeader("X-Session")String s,@RequestBody Map<String,String>b){
  String uid=member(s),name=b.getOrDefault("name","").strip();if(name.length()<2||name.length()>60)throw new IllegalArgumentException("Use a name between 2 and 60 characters.");
  e.db.update("UPDATE v2_users SET name=? WHERE id=?",name,uid);return Map.of("user",a.meById(uid));
 }
 @PostMapping("/password") Object password(@RequestHeader("X-Session")String s,@RequestBody Map<String,String>b){
  String uid=member(s);a.throttle("password:"+uid);a.password(b.get("password"));
  return e.tx.execute(t->{e.lock();member(s);credentials(uid,b.get("currentPassword"));return rotate(uid,b.get("password"));});
 }
 @PostMapping("/forgot") Object forgot(@RequestHeader(value="X-Client-IP",defaultValue="local")String ip,@RequestBody Map<String,String>b){
  a.throttle("forgot:"+ip);String email=normalized(b);var rows=e.db.queryForList("SELECT id,hash FROM v2_users WHERE email=? AND (hash IS NOT NULL OR google_sub IS NOT NULL)",email);
  if(rows.isEmpty())return Map.of("challenge",a.secret(),"email",email,"expiresIn",900);
  var row=rows.get(0);return mail.send(Map.of("email",email),ip,"reset",(String)row.get("id"),(String)row.get("hash"));
 }
 @PostMapping("/reset") Object reset(@RequestHeader(value="X-Client-IP",defaultValue="local")String ip,@RequestBody Map<String,String>b){
  a.throttle("reset:"+ip);a.password(b.get("password"));String email=normalized(b);
  var rows=e.db.queryForList("SELECT id FROM v2_users WHERE email=?",email);
  String uid=rows.isEmpty()?"missing":(String)rows.get(0).get("id");mail.check(b,"reset",uid);
  return e.tx.execute(t->{e.lock();consume(b,"reset",uid);return rotate(uid,b.get("password"));});
 }
 void consume(Map<String,String>b,String purpose,String uid){
  int n=e.db.update("DELETE FROM email_challenges c USING v2_users u WHERE c.id=? AND c.email=? AND c.purpose=? AND c.owner_id=? AND c.code_hash=? AND c.expires>now() AND u.id=c.owner_id AND u.hash IS NOT DISTINCT FROM c.credential_hash",b.getOrDefault("challenge",""),normalized(b),purpose,uid,a.digest(b.getOrDefault("challenge","")+":"+b.getOrDefault("emailCode","")));
  if(n!=1)throw new IllegalArgumentException("Code expired or account changed. Request a new code.");
 }
 @PostMapping("/email-code") Object emailCode(@RequestHeader("X-Session")String s,@RequestHeader(value="X-Client-IP",defaultValue="local")String ip,@RequestBody Map<String,String>b){
  String uid=member(s);a.throttle("email-change:"+uid);var row=credentials(uid,b.get("currentPassword"));
  if(e.db.queryForObject("SELECT count(*) FROM v2_users WHERE email=?",Integer.class,normalized(b))>0)throw new IllegalArgumentException("This email is already in use.");
  return mail.send(b,ip,"change-email",uid,(String)row.get("hash"));
 }
 @PostMapping("/email") Object email(@RequestHeader("X-Session")String s,@RequestBody Map<String,String>b){
  String uid=member(s);a.throttle("email-confirm:"+uid);mail.check(b,"change-email",uid);
  return e.tx.execute(t->{e.lock();member(s);credentials(uid,b.get("currentPassword"));consume(b,"change-email",uid);
   if(e.db.queryForObject("SELECT count(*) FROM v2_users WHERE email=?",Integer.class,normalized(b))>0)throw new IllegalArgumentException("This email is already in use.");
   e.db.update("UPDATE v2_users SET email=?,email_verified=true,google_sub=NULL WHERE id=?",normalized(b),uid);
   e.db.update("DELETE FROM email_challenges WHERE owner_id=?",uid);
   e.db.update("DELETE FROM v2_sessions WHERE user_id=?",uid);
   return Map.of("token",a.session(uid),"user",a.meById(uid));});
 }
 @GetMapping("/sessions") Object sessions(@RequestHeader("X-Session")String s){String uid=member(s);return e.db.queryForList("SELECT public_id AS id,created,expires,(token=?) AS current FROM v2_sessions WHERE user_id=? AND expires>now() ORDER BY created DESC",a.digest(s),uid);}
 @PostMapping("/sessions/revoke") Object revoke(@RequestHeader("X-Session")String s,@RequestBody Map<String,String>b){
  String uid=member(s);String id=b.getOrDefault("id","");
  if(id.equals("others"))e.db.update("DELETE FROM v2_sessions WHERE user_id=? AND token<>?",uid,a.digest(s));
  else e.db.update("DELETE FROM v2_sessions WHERE user_id=? AND public_id=? AND token<>?",uid,id,a.digest(s));
  return Map.of("ok",true);
 }
}
