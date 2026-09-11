package lab;

import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.stereotype.Service;

@Service
public class Identity {
  final Exchange e;
  final SecureRandom random = new SecureRandom();
  final Map<String, Deque<Long>> limits = new ConcurrentHashMap<>();

  Identity(Exchange e) {
    this.e = e;
  }

  String id() {
    return UUID.randomUUID().toString();
  }

  String secret() {
    byte[] b = new byte[32];
    random.nextBytes(b);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  String digest(String s) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256")
                  .digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  String hash(String p, String salt) {
    try {
      var spec = new PBEKeySpec(p.toCharArray(), Base64.getDecoder().decode(salt), 160000, 256);
      return Base64.getEncoder()
          .encodeToString(
              SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                  .generateSecret(spec)
                  .getEncoded());
    } catch (Exception ex) {
      throw new IllegalStateException(ex);
    }
  }

  boolean same(String a, String b) {
    return MessageDigest.isEqual(a.getBytes(), b.getBytes());
  }

  void throttle(String key) {
    synchronized (limits) {
      long now = System.currentTimeMillis();
      if (limits.size() > 10000) limits.clear();
      var q = limits.computeIfAbsent(key, k -> new ArrayDeque<>());
      while (!q.isEmpty() && q.peek() < now - 300000) q.poll();
      if (q.size() >= 10)
        throw new IllegalArgumentException("Too many attempts. Try again in five minutes.");
      q.add(now);
    }
  }

  void password(String p) {
    if (p == null || p.length() < 10 || p.length() > 128)
      throw new IllegalArgumentException("Use a password between 10 and 128 characters.");
  }

  String user(String token) {
    if (token == null || token.length() > 100)
      throw new IllegalArgumentException("Sign in to continue");
    var rows =
        e.db.queryForList(
            "SELECT user_id FROM v2_sessions WHERE token=? AND expires>now()", digest(token));
    if (rows.isEmpty()) throw new IllegalArgumentException("Session expired. Sign in again.");
    return (String) rows.get(0).get("user_id");
  }

  String session(String uid) {
    String token = secret();
    e.db.update("INSERT INTO v2_sessions(token,user_id,expires) VALUES (?,?,now()+interval '7 days')", digest(token), uid);
    return token;
  }

  Map<String, Object> me(String token) {
    String uid = user(token);
    return e.db.queryForMap(
        "SELECT id,name,email,(hash IS NOT NULL OR google_sub IS NOT NULL) AS registered,(hash IS NOT NULL) AS has_password,(google_sub IS NOT NULL) AS google_connected,email_verified FROM v2_users WHERE id=?", uid);
  }

  Map<String, Object> guest() {
    return e.tx.execute(
        t -> {
          e.lock();
          if (e.db.queryForObject("SELECT count(*) FROM v2_users", Integer.class) > 2000)
            throw new IllegalArgumentException("Account capacity reached");
          String uid = id();
          e.db.update("INSERT INTO v2_users(id,name) VALUES (?,?)", uid, "Guest trader");
          return Map.of("token", session(uid), "user", meById(uid));
        });
  }

  Map<String, Object> meById(String uid) {
    return e.db.queryForMap(
        "SELECT id,name,email,(hash IS NOT NULL OR google_sub IS NOT NULL) AS registered,(hash IS NOT NULL) AS has_password,(google_sub IS NOT NULL) AS google_connected,email_verified FROM v2_users WHERE id=?", uid);
  }

  Map<String, Object> register(String token, Map<String, String> b, String ip) {
    throttle(ip);
    String email = b.getOrDefault("email", "").trim().toLowerCase(Locale.ROOT),
        name = b.getOrDefault("name", "").trim(),
        pass = b.get("password");
    password(pass);
    if (!email.matches("[^@\\s]{1,64}@[^@\\s]{1,120}\\.[^@\\s]{2,20}")
        || name.length() < 2
        || name.length() > 60) throw new IllegalArgumentException("Enter a valid name and email");
    String salt = Base64.getEncoder().encodeToString(random.generateSeed(16)),
        h = hash(pass, salt),
        recovery = secret();
    return e.tx.execute(
        t -> {
          e.lock();
          if(e.db.update("DELETE FROM email_challenges WHERE purpose='register' AND id=? AND email=? AND code_hash=? AND expires>now()",b.getOrDefault("challenge",""),email,digest(b.getOrDefault("challenge","")+":"+b.getOrDefault("emailCode","")))!=1)
            throw new IllegalArgumentException("Verification code already used or expired.");
          if (e.db.queryForObject(
                  "SELECT count(*) FROM v2_users WHERE email=?", Integer.class, email)
              > 0)
            throw new IllegalArgumentException(
                "This email is already registered. Sign in instead.");
          String uid;
          try {
            uid = user(token);
          } catch (Exception ex) {
            uid = id();
            e.db.update("INSERT INTO v2_users(id,name) VALUES (?,?)", uid, name);
          }
          if (Boolean.TRUE.equals(meById(uid).get("registered")))
            throw new IllegalArgumentException("Already registered");
          e.db.update(
              "UPDATE v2_users SET email=?,name=?,hash=?,salt=?,recovery_hash=?,email_verified=true WHERE id=?",
              email,
              name,
              h,
              salt,
              digest(recovery),
              uid);
          e.db.update("DELETE FROM v2_sessions WHERE user_id=?", uid);
          return Map.of("token", session(uid), "user", meById(uid), "recoveryCode", recovery);
        });
  }

  Map<String, Object> login(Map<String, String> b, String ip) {
    throttle(ip);
    String email = b.getOrDefault("email", "").trim().toLowerCase(Locale.ROOT),
        pass = b.getOrDefault("password", "");
    if (pass.length() > 128) throw new IllegalArgumentException("Invalid credentials");
    var rows = e.db.queryForList("SELECT * FROM v2_users WHERE email=? AND hash IS NOT NULL", email);
    String dummy = Base64.getEncoder().encodeToString(new byte[16]);
    String h = hash(pass, rows.isEmpty() ? dummy : (String) rows.get(0).get("salt"));
    if (rows.isEmpty() || !same(h, (String) rows.get(0).get("hash")))
      throw new IllegalArgumentException("Invalid email or password");
    String uid = (String) rows.get(0).get("id");
    return Map.of("token", session(uid), "user", meById(uid));
  }

  Map<String, Object> recover(Map<String, String> b, String ip) {
    throttle(ip);
    password(b.get("password"));
    String email = b.getOrDefault("email", "").toLowerCase(Locale.ROOT).trim();
    var rows = e.db.queryForList("SELECT * FROM v2_users WHERE email=?", email);
    if (rows.isEmpty()
        || !same(
            digest(b.getOrDefault("recoveryCode", "")),
            String.valueOf(rows.get(0).get("recovery_hash"))))
      throw new IllegalArgumentException("Invalid recovery details");
    String uid = (String) rows.get(0).get("id"),
        salt = Base64.getEncoder().encodeToString(random.generateSeed(16)),
        code = secret(),
        h = hash(b.get("password"), salt);
    return e.tx.execute(
        t -> {
          e.lock();
          String current =
              e.db.queryForObject(
                  "SELECT recovery_hash FROM v2_users WHERE id=?", String.class, uid);
          if (!same(current, digest(b.getOrDefault("recoveryCode", ""))))
            throw new IllegalArgumentException("Invalid recovery details");
          e.db.update(
              "UPDATE v2_users SET hash=?,salt=?,recovery_hash=? WHERE id=?",
              h,
              salt,
              digest(code),
              uid);
          e.db.update("DELETE FROM v2_sessions WHERE user_id=?", uid);
          return Map.of("token", session(uid), "user", meById(uid), "recoveryCode", code);
        });
  }

  void logout(String token) {
    if (token != null) e.db.update("DELETE FROM v2_sessions WHERE token=?", digest(token));
  }
}
