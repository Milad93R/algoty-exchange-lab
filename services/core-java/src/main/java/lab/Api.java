package lab;

import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class Api {
  final Exchange exchange;

  public Api(Exchange e) {
    exchange = e;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "UP");
  }

  @GetMapping(value = "/metrics", produces = "text/plain")
  public String metrics() {
    return "exchange_core_pending_commands "
        + exchange.db.queryForObject("SELECT count(*) FROM outbox WHERE NOT done", Integer.class)
        + "\nexchange_core_trades_total "
        + exchange.db.queryForObject("SELECT count(*) FROM trades", Integer.class)
        + "\n";
  }

  @PostMapping("/api/session")
  public Map<String, String> create() {
    return Map.of("session", exchange.create());
  }

  @GetMapping("/api/state")
  public Map<String, Object> state(@RequestHeader("X-Session") String s) {
    return exchange.state(s);
  }

  record Place(String side, long price, long quantity, String key) {}

  @PostMapping("/api/orders")
  public Map<String, String> place(@RequestHeader("X-Session") String s, @RequestBody Place p) {
    return Map.of("id", exchange.submit(s, p.side(), p.price(), p.quantity(), p.key()));
  }

  @PostMapping("/api/cancel/{id}")
  public Map<String, Boolean> cancel(
      @RequestHeader("X-Session") String s, @PathVariable String id) {
    exchange.cancel(s, id);
    return Map.of("accepted", true);
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.dao.EmptyResultDataAccessException.class
  })
  public ResponseEntity<Map<String, String>> bad(Exception e) {
    return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
  }
}
