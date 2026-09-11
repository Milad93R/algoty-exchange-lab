package lab;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

@Service
public class EmailVerification {
  final Exchange e;
  final Identity identity;
  final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  EmailVerification(Exchange e, Identity identity){this.e=e;this.identity=identity;}
  @PostConstruct void init(){
    e.db.execute("CREATE TABLE IF NOT EXISTS email_challenges (id text PRIMARY KEY,email text NOT NULL,code_hash text NOT NULL,expires timestamptz NOT NULL,attempts int NOT NULL DEFAULT 0,created timestamptz NOT NULL DEFAULT now())");
    e.db.execute("ALTER TABLE email_challenges ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'register'");
    e.db.execute("ALTER TABLE email_challenges ADD COLUMN IF NOT EXISTS owner_id text");
    e.db.execute("ALTER TABLE email_challenges ADD COLUMN IF NOT EXISTS credential_hash text");
    e.db.execute("ALTER TABLE v2_users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false");
  }
  Map<String,Object> send(Map<String,String> b,String ip){
    return send(b,ip,"register",null,null);
  }
  Map<String,Object> send(Map<String,String> b,String ip,String purpose,String owner,String credential){
    identity.throttle("email-ip:"+ip);
    String email=b.getOrDefault("email","").strip().toLowerCase(Locale.ROOT);
    if(email.length()>180 || !email.matches("[^@\\s]{1,64}@[^@\\s]{1,120}\\.[^@\\s]{2,20}"))throw new IllegalArgumentException("Enter a valid email address.");
    identity.throttle("email:"+email);
    String key=System.getenv("RESEND_API_KEY"),from=System.getenv("MAIL_FROM");
    if(key==null||from==null)throw new IllegalArgumentException("Email delivery is temporarily unavailable.");
    String id=identity.secret(),code=String.format("%06d",new SecureRandom().nextInt(1000000));
    e.tx.execute(t->{
      e.lock();
      if(e.db.queryForObject("SELECT count(*) FROM email_challenges WHERE email=? AND purpose=? AND created>now()-interval '60 seconds'",Integer.class,email,purpose)>0)throw new IllegalArgumentException("Please wait one minute before requesting another code.");
      e.db.update("DELETE FROM email_challenges WHERE expires<now() OR (email=? AND purpose=?)",email,purpose);
      e.db.update("INSERT INTO email_challenges(id,email,code_hash,expires,purpose,owner_id,credential_hash) VALUES (?,?,?,now()+interval '15 minutes',?,?,?)",id,email,identity.digest(id+":"+code),purpose,owner,credential);return null;
    });
    try{
      String instruction=purpose.equals("reset")?"Confirm your password reset request.":purpose.equals("change-email")?"Confirm your new email address.":"Confirm your email to create your AlgoTy account.";
      String html="<div style='background:#f4f2eb;padding:40px;font-family:Arial;color:#20231f'><p style='font-size:28px;font-weight:bold'>algoty ↗</p><h1>Make it yours.</h1><p>"+instruction+"</p><p style='font-size:36px;letter-spacing:8px;color:#c53b18'>"+code+"</p><p>This code expires in 15 minutes and can be used once.</p><p>If you did not request this, you can ignore this email.</p></div>";
      var body=Map.of("from",from,"to",List.of(email),"subject","Your AlgoTy verification code","html",html,"text","Your AlgoTy verification code: "+code+". Expires in 15 minutes. If you did not request this, ignore this email.");
      var req=HttpRequest.newBuilder(URI.create("https://api.resend.com/emails")).timeout(Duration.ofSeconds(12)).header("Authorization","Bearer "+key).header("Content-Type","application/json").header("Idempotency-Key","verify-"+id).POST(HttpRequest.BodyPublishers.ofString(e.json.writeValueAsString(body))).build();
      var res=client.send(req,HttpResponse.BodyHandlers.ofString());
      if(res.statusCode()<200||res.statusCode()>=300)throw new IllegalStateException("Mail rejected");
      return Map.of("challenge",id,"email",email,"expiresIn",900);
    }catch(Exception ex){e.db.update("DELETE FROM email_challenges WHERE id=?",id);throw new IllegalArgumentException("We could not send your code. Please try again shortly.");}
  }
  // Called before registration's transaction: failed attempts must remain committed.
  void check(Map<String,String> b){
    check(b,"register",null);
  }
  void check(Map<String,String> b,String purpose,String owner){
    String id=b.getOrDefault("challenge",""),code=b.getOrDefault("emailCode","");
    var rows=e.db.queryForList("UPDATE email_challenges SET attempts=attempts+1 WHERE id=? AND email=? AND purpose=? AND owner_id IS NOT DISTINCT FROM ? AND expires>now() AND attempts<5 RETURNING code_hash",id,b.getOrDefault("email","").strip().toLowerCase(Locale.ROOT),purpose,owner);
    if(rows.isEmpty()||!identity.same(identity.digest(id+":"+code),String.valueOf(rows.get(0).get("code_hash"))))throw new IllegalArgumentException("Invalid or expired verification code. Request a new code if needed.");
  }
}
