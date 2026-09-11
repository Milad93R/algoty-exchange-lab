package lab;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2")
public class ProductApi {
  final Identity auth;
  final Paper paper;
  final EmailVerification email;
  final Missions missions;

  ProductApi(Identity a, Paper p, Missions m, EmailVerification email) {
    auth = a;
    this.email=email;
    paper = p;
    missions = m;
  }

  @PostMapping("/session")
  public Map<String, Object> session(
      @RequestHeader(value = "X-Session", required = false) String s) {
    try {
      return Map.of("user", auth.me(s));
    } catch (Exception ex) {
      return auth.guest();
    }
  }

  @GetMapping("/me")
  public Map<String, Object> me(@RequestHeader("X-Session") String s) {
    return auth.me(s);
  }

  @PostMapping("/email-code")
  public Map<String,Object> emailCode(@RequestHeader(value="X-Client-IP",defaultValue="local") String ip,@RequestBody Map<String,String> b){return email.send(b,ip);}

  @PostMapping("/register")
  public Map<String, Object> register(
      @RequestHeader(value = "X-Session", required = false) String s,
      @RequestHeader(value = "X-Client-IP", defaultValue = "local") String ip,
      @RequestBody Map<String, String> b) {
    email.check(b);
    return auth.register(s, b, ip);
  }

  @PostMapping("/login")
  public Map<String, Object> login(
      @RequestHeader(value = "X-Client-IP", defaultValue = "local") String ip,
      @RequestBody Map<String, String> b) {
    return auth.login(b, ip);
  }

  @PostMapping("/recover")
  public Map<String, Object> recover(
      @RequestHeader(value = "X-Client-IP", defaultValue = "local") String ip,
      @RequestBody Map<String, String> b) {
    return auth.recover(b, ip);
  }

  @PostMapping("/logout")
  public Map<String, Boolean> logout(
      @RequestHeader(value = "X-Session", required = false) String s) {
    auth.logout(s);
    return Map.of("ok", true);
  }

  @GetMapping("/portfolio")
  public Map<String, Object> portfolio(
      @RequestHeader("X-Session") String s, @RequestParam(required = false) String account) {
    return paper.state(auth.user(s), account);
  }

  @PostMapping("/orders")
  public Map<String, Object> order(
      @RequestHeader("X-Session") String s, @RequestBody Map<String, Object> b) {
    if (b.get("account") != null)
      throw new IllegalArgumentException("Manual orders use your personal account");
    return paper.submit(auth.user(s), b);
  }

  @PostMapping("/orders/{id}/cancel")
  public Map<String, Boolean> cancel(
      @RequestHeader("X-Session") String s, @PathVariable String id) {
    paper.cancel(auth.user(s), id);
    return Map.of("ok", true);
  }

  @GetMapping("/missions")
  public Object missions(@RequestHeader("X-Session") String s) {
    return missions.list(auth.user(s));
  }

  @PostMapping("/missions")
  public Object draft(@RequestHeader("X-Session") String s, @RequestBody Map<String, Object> b) {
    return missions.draft(auth.user(s), b);
  }

  @PostMapping("/missions/manual")
  public Object manual(@RequestHeader("X-Session") String s, @RequestBody Map<String, Object> b) {
    return missions.manual(auth.user(s), b);
  }

  @PostMapping("/missions/{id}/replay")
  public Object replay(
      @RequestHeader("X-Session") String s,
      @PathVariable String id,
      @RequestBody Map<String, Object> b) {
    return missions.replay(auth.user(s), id, b);
  }

  @GetMapping("/missions/{id}")
  public Object detail(@RequestHeader("X-Session") String s, @PathVariable String id) {
    return missions.detail(auth.user(s), id);
  }

  @PostMapping("/missions/{id}/edit")
  public Object edit(
      @RequestHeader("X-Session") String s,
      @PathVariable String id,
      @RequestBody Map<String, Object> b) {
    return missions.edit(auth.user(s), id, b);
  }

  @PostMapping("/missions/{id}/control")
  public Object control(
      @RequestHeader("X-Session") String s,
      @PathVariable String id,
      @RequestBody Map<String, String> b) {
    return missions.control(auth.user(s), id, b.get("action"));
  }

  @PostMapping("/missions/{id}/instruction")
  public Object instruction(
      @RequestHeader("X-Session") String s,
      @PathVariable String id,
      @RequestBody Map<String, String> b) {
    return missions.previewControl(auth.user(s), id, b.getOrDefault("instruction", ""));
  }

  @PostMapping("/missions/{id}/branch")
  public Object branch(
      @RequestHeader("X-Session") String s,
      @PathVariable String id,
      @RequestBody Map<String, Object> b) {
    return missions.branch(auth.user(s), id, b);
  }

  @PostMapping("/comparisons/{id}/start")
  public Object start(@RequestHeader("X-Session") String s, @PathVariable String id) {
    return missions.startGroup(auth.user(s), id);
  }

  @PostMapping("/comparisons/{id}/share")
  public Object share(@RequestHeader("X-Session") String s, @PathVariable String id) {
    return missions.share(auth.user(s), id);
  }

  @GetMapping("/shared/{token}")
  public Object shared(@PathVariable String token) {
    return missions.publicShare(token);
  }

  void internal(String token) {
    String expected = System.getenv("AI_INTERNAL_TOKEN");
    if (expected == null || !auth.same(expected, token))
      throw new IllegalArgumentException("Unauthorized worker");
  }

  @GetMapping("/internal/work")
  public Object work(@RequestHeader("X-Worker-Token") String token) {
    internal(token);
    return missions.work();
  }

  @PostMapping("/internal/decision")
  public Object decision(
      @RequestHeader("X-Worker-Token") String token, @RequestBody Map<String, Object> b) {
    internal(token);
    return missions.decision(b);
  }
}
