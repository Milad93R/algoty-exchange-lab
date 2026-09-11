package lab;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.time.Instant;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;

class GoogleIdentityTest {
 Exchange e;Identity a;GoogleIdentity google;List<String> users=new ArrayList<>();
 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:18204/exchange","exchange",System.getenv("DB_PASSWORD"));
  e=new Exchange(new JdbcTemplate(ds),new TransactionTemplate(new DataSourceTransactionManager(ds)),new ObjectMapper());a=new Identity(e);var mail=new EmailVerification(e,a);mail.init();var security=new AccountSecurity(e,a,mail);security.init();google=new GoogleIdentity(e,a,security);google.init();
 }
 @AfterEach void cleanup(){for(String uid:users){e.db.update("DELETE FROM google_flows WHERE uid=?",uid);e.db.update("DELETE FROM email_challenges WHERE owner_id=?",uid);e.db.update("DELETE FROM v2_sessions WHERE user_id=?",uid);e.db.update("DELETE FROM v2_users WHERE id=?",uid);}}
 Map<String,Object> guest(){var d=a.guest();users.add((String)((Map<?,?>)d.get("user")).get("id"));return d;}
 Map<String,Object> flow(Map<String,Object>d,String mode){return Map.of("uid",((Map<?,?>)d.get("user")).get("id"),"session_hash",a.digest((String)d.get("token")),"mode",mode);}
 @Test void guestUpgradeAndRepeatedLogin(){
  var g=guest();String uid=users.get(0),sub="qa-"+UUID.randomUUID(),email=sub+"@example.invalid";
  var d=(Map<?,?>)google.complete(flow(g,"login"),sub,email,"Google QA");assertEquals(uid,((Map<?,?>)d.get("user")).get("id"));assertEquals(true,a.meById(uid).get("registered"));assertEquals(false,a.meById(uid).get("has_password"));assertThrows(IllegalArgumentException.class,()->a.login(Map.of("email",email,"password","random-password"),"qa"));
  var again=(Map<?,?>)google.complete(Map.of("mode","login"),sub,email,"Google QA");assertEquals(uid,((Map<?,?>)again.get("user")).get("id"));
 }
 @Test void noEmailAutoLinkAndExplicitLink(){
  var g=guest();String uid=users.get(0),email="qa-"+UUID.randomUUID()+"@example.invalid",sub="qa-"+UUID.randomUUID();String salt=Base64.getEncoder().encodeToString(new byte[16]);
  e.db.update("UPDATE v2_users SET email=?,hash=?,salt=? WHERE id=?",email,a.hash("test-password-123",salt),salt,uid);
  assertThrows(IllegalArgumentException.class,()->google.complete(Map.of("mode","login"),sub,email,"QA"));
  assertThrows(IllegalArgumentException.class,()->google.complete(flow(g,"link"),sub,"other@example.invalid","QA"));
  var d=(Map<?,?>)google.complete(flow(g,"link"),sub,email,"QA");assertEquals(uid,((Map<?,?>)d.get("user")).get("id"));assertEquals(true,a.meById(uid).get("google_connected"));
 }
 @Test void googleOnlyCanSetPasswordByVerifiedEmail(){
  var g=guest();String uid=users.get(0),sub="qa-"+UUID.randomUUID(),email=sub+"@example.invalid";
  google.complete(flow(g,"login"),sub,email,"QA");String challenge=a.secret(),code="123456";
  e.db.update("INSERT INTO email_challenges(id,email,code_hash,expires,purpose,owner_id,credential_hash) VALUES (?,?,?,now()+interval '15 minutes','reset',?,NULL)",challenge,email,a.digest(challenge+":"+code),uid);
  var security=new AccountSecurity(e,a,new EmailVerification(e,a));
  security.reset("qa-reset-"+uid,Map.of("email",email,"challenge",challenge,"emailCode",code,"password","new-password-123"));
  assertEquals(true,a.meById(uid).get("has_password"));assertEquals(true,a.meById(uid).get("google_connected"));
  assertNotNull(a.login(Map.of("email",email,"password","new-password-123"),"qa-login-"+uid).get("token"));
 }
 @Test void revokedSessionCannotUpgrade(){var g=guest();a.logout((String)g.get("token"));assertThrows(IllegalArgumentException.class,()->google.complete(flow(g,"login"),"qa-sub","qa@example.invalid","QA"));}
 @Test void claims(){
  Map<String,Object> claims=new HashMap<>(Map.of("sub","123","iss","https://accounts.google.com","aud",List.of("client"),"nonce","nonce","email_verified",true,"exp",Instant.now().plusSeconds(300),"iat",Instant.now()));
  java.util.function.Function<Map<String,Object>,Jwt> jwt=c->Jwt.withTokenValue("test").header("alg","RS256").claims(x->x.putAll(c)).build();
  GoogleIdentity.validate(jwt.apply(claims),"nonce","client");
  for(String key:List.of("iss","aud","nonce","email_verified","exp","azp")){
   var bad=new HashMap<>(claims);bad.put(key,switch(key){case "aud"->List.of("other");case "email_verified"->false;case "exp"->Instant.now().minusSeconds(30);default->"wrong";});
   assertThrows(IllegalArgumentException.class,()->GoogleIdentity.validate(jwt.apply(bad),"nonce","client"));
  }
 }
 @Test void stateIsBrowserBoundAndSingleUse(){
  String state=a.secret(),binding=a.secret();e.db.update("INSERT INTO google_flows VALUES (?,?,?,?,NULL,NULL,'login',now()+interval '10 minutes')",a.digest(state),a.digest(binding),a.secret(),a.secret());
  try{assertThrows(IllegalArgumentException.class,()->google.finish(Map.of("state",state,"binding","wrong","code","invalid")));assertEquals(1,e.db.queryForObject("SELECT count(*) FROM google_flows WHERE state_hash=?",Integer.class,a.digest(state)));}finally{e.db.update("DELETE FROM google_flows WHERE state_hash=?",a.digest(state));}
 }
}
