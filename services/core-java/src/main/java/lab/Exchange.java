package lab;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Exchange {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final ObjectMapper json;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  volatile String deliveryError = "";

  public Exchange(JdbcTemplate d, TransactionTemplate t, ObjectMapper j) {
    db = d;
    tx = t;
    json = j;
  }

  void lock() {
    db.execute("SELECT pg_advisory_xact_lock(18201)");
  }

  String encode(Object o) {
    try {
      return json.writeValueAsString(o);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  long n(Map<String, Object> r, String k) {
    return ((Number) r.get(k)).longValue();
  }

  void session(String s) {
    if (s == null
        || db.queryForObject("SELECT count(*) FROM sessions WHERE id=?", Integer.class, s) != 1)
      throw new IllegalArgumentException("Unknown session");
  }

  public String create() {
    return tx.execute(
        t -> {
          lock();
          if (db.queryForObject("SELECT count(*) FROM sessions", Integer.class) >= 200)
            throw new IllegalArgumentException("Demo session capacity reached");
          String s = UUID.randomUUID().toString();
          db.update("INSERT INTO sessions(id) VALUES (?)", s);
          for (String owner : List.of("user", "liquidity")) {
            long base = owner.equals("user") ? 1000 : 100000;
            long quote = owner.equals("user") ? 1000000000L : 100000000000L;
            db.update(
                "INSERT INTO balances(session_id,owner,base,quote) VALUES (?,?,?,?)",
                s,
                owner,
                base,
                quote);
            entry("fund-" + s + owner, s, owner, "BTC", base);
            entry("fund-" + s + owner, s, "treasury", "BTC", -base);
            entry("fund-" + s + owner, s, owner, "USD", quote);
            entry("fund-" + s + owner, s, "treasury", "USD", -quote);
          }
          for (int i = 0; i < 5; i++) {
            place(s, "liquidity", "BUY", 6000000 - i * 10000, 100, UUID.randomUUID().toString());
            place(s, "liquidity", "SELL", 6010000 + i * 10000, 100, UUID.randomUUID().toString());
          }
          return s;
        });
  }

  void entry(String event, String s, String owner, String asset, long amount) {
    db.update(
        "INSERT INTO ledger(event_id,session_id,owner,asset,amount) VALUES (?,?,?,?,?)",
        event,
        s,
        owner,
        asset,
        amount);
  }

  public String submit(String s, String side, long price, long quantity, String key) {
    return tx.execute(
        t -> {
          lock();
          session(s);
          if (key == null || !key.matches("[a-zA-Z0-9-]{8,80}"))
            throw new IllegalArgumentException("Idempotency key required");
          return place(s, "user", side, price, quantity, s + "-" + key);
        });
  }

  String place(String s, String owner, String side, long price, long quantity, String id) {
    if (!List.of("BUY", "SELL").contains(side)
        || price < 1
        || price > 100000000
        || quantity < 1
        || quantity > 1000000) throw new IllegalArgumentException("Invalid price or quantity");
    var old = db.queryForList("SELECT * FROM orders WHERE id=?", id);
    if (!old.isEmpty()) {
      var o = old.get(0);
      if (!o.get("session_id").equals(s)
          || !o.get("side").equals(side)
          || n(o, "price") != price
          || n(o, "quantity") != quantity)
        throw new IllegalArgumentException("Idempotency payload conflict");
      return id;
    }
    if (db.queryForObject("SELECT count(*) FROM orders WHERE session_id=?", Integer.class, s)
        >= 210) throw new IllegalArgumentException("Demo order limit reached");
    var b =
        db.queryForMap(
            "SELECT * FROM balances WHERE session_id=? AND owner=? FOR UPDATE", s, owner);
    long cost = Math.multiplyExact(price, quantity);
    if (side.equals("BUY")) {
      if (n(b, "quote") - n(b, "reserved_quote") < cost)
        throw new IllegalArgumentException("Insufficient available USD");
      db.update(
          "UPDATE balances SET reserved_quote=reserved_quote+? WHERE session_id=? AND owner=?",
          cost,
          s,
          owner);
    } else {
      if (n(b, "base") - n(b, "reserved_base") < quantity)
        throw new IllegalArgumentException("Insufficient available BTC");
      db.update(
          "UPDATE balances SET reserved_base=reserved_base+? WHERE session_id=? AND owner=?",
          quantity,
          s,
          owner);
    }
    db.update(
        "INSERT INTO orders(id,session_id,owner,side,price,quantity,remaining,status) VALUES"
            + " (?,?,?,?,?,?,?,'PENDING')",
        id,
        s,
        owner,
        side,
        price,
        quantity,
        quantity);
    enqueue(
        id,
        "place",
        Map.of(
            "id",
            id,
            "book",
            s,
            "owner",
            owner,
            "side",
            side,
            "price",
            price,
            "remaining",
            quantity));
    return id;
  }

  void enqueue(String id, String kind, Map<String, Object> order) {
    db.update(
        "INSERT INTO outbox(id,payload) VALUES (?,?) ON CONFLICT DO NOTHING",
        id,
        encode(Map.of("id", id, "kind", kind, "order", order)));
  }

  public void cancel(String s, String id) {
    tx.executeWithoutResult(
        t -> {
          lock();
          session(s);
          var o =
              db.queryForMap(
                  "SELECT * FROM orders WHERE id=? AND session_id=? AND owner='user'", id, s);
          if (n(o, "remaining") == 0 || o.get("status").equals("CANCELED")) return;
          enqueue("cancel-" + id, "cancel", Map.of("id", id, "book", s, "owner", "user"));
        });
  }

  @Scheduled(fixedDelay = 150)
  public void dispatch() {
    try {
      for (int i = 0; i < 20; i++) {
        Boolean more =
            tx.execute(
                t -> {
                  lock();
                  var rows =
                      db.queryForList(
                          "SELECT * FROM outbox WHERE NOT done ORDER BY created_at,id LIMIT 1 FOR"
                              + " UPDATE");
                  if (rows.isEmpty()) return false;
                  var row = rows.get(0);
                  try {
                    var request =
                        HttpRequest.newBuilder(URI.create("http://127.0.0.1:18202/command"))
                            .timeout(Duration.ofSeconds(3))
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString((String) row.get("payload")))
                            .build();
                    var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                    if (response.statusCode() != 200)
                      throw new IllegalStateException(response.body());
                    var result = json.readTree(response.body());
                    settle(result);
                    db.update("UPDATE outbox SET done=true WHERE id=?", row.get("id"));
                    return true;
                  } catch (Exception e) {
                    throw new IllegalStateException("Delivery pending: " + e.getMessage(), e);
                  }
                });
        if (!Boolean.TRUE.equals(more)) break;
      }
      deliveryError = "";
    } catch (Exception e) {
      deliveryError = "Matching engine unavailable or delivery pending; orders remain durable.";
    }
  }

  void settle(JsonNode r) {
    String id = r.path("command").path("order").path("id").asText();
    var incoming = db.queryForMap("SELECT * FROM orders WHERE id=?", id);
    String s = (String) incoming.get("session_id");
    for (JsonNode trade : r.path("trades")) {
      String tid = trade.path("id").asText();
      if (db.queryForObject("SELECT count(*) FROM trades WHERE id=?", Integer.class, tid) > 0)
        continue;
      String buy = trade.path("buy").asText(), sell = trade.path("sell").asText();
      long price = trade.path("price").asLong(),
          q = trade.path("quantity").asLong(),
          cost = Math.multiplyExact(price, q);
      var b = db.queryForMap("SELECT * FROM orders WHERE id=?", buy);
      var a = db.queryForMap("SELECT * FROM orders WHERE id=?", sell);
      String bo = (String) b.get("owner"), so = (String) a.get("owner");
      db.update(
          "UPDATE balances SET quote=quote-?, base=base+?, reserved_quote=reserved_quote-? WHERE"
              + " session_id=? AND owner=?",
          cost,
          q,
          Math.multiplyExact(n(b, "price"), q),
          s,
          bo);
      db.update(
          "UPDATE balances SET quote=quote+?, base=base-?, reserved_base=reserved_base-? WHERE"
              + " session_id=? AND owner=?",
          cost,
          q,
          q,
          s,
          so);
      for (String oid : List.of(buy, sell))
        db.update(
            "UPDATE orders SET remaining=remaining-?, status=CASE WHEN remaining-?=0 THEN 'FILLED'"
                + " ELSE 'PARTIAL' END WHERE id=?",
            q,
            q,
            oid);
      entry(tid, s, bo, "USD", -cost);
      entry(tid, s, so, "USD", cost);
      entry(tid, s, bo, "BTC", q);
      entry(tid, s, so, "BTC", -q);
      db.update(
          "INSERT INTO trades(id,session_id,buy_id,sell_id,price,quantity) VALUES (?,?,?,?,?,?)",
          tid,
          s,
          buy,
          sell,
          price,
          q);
    }
    if (r.path("command").path("kind").asText().equals("cancel")) {
      long remaining = r.path("canceled").asLong();
      if (incoming.get("side").equals("BUY"))
        db.update(
            "UPDATE balances SET reserved_quote=reserved_quote-? WHERE session_id=? AND owner=?",
            remaining * n(incoming, "price"),
            s,
            incoming.get("owner"));
      else
        db.update(
            "UPDATE balances SET reserved_base=reserved_base-? WHERE session_id=? AND owner=?",
            remaining,
            s,
            incoming.get("owner"));
      db.update(
          "UPDATE orders SET remaining=0,status=CASE WHEN status='FILLED' THEN 'FILLED' ELSE"
              + " 'CANCELED' END WHERE id=?",
          id);
    } else
      db.update(
          "UPDATE orders SET status=CASE WHEN remaining=0 THEN 'FILLED' WHEN remaining<quantity"
              + " THEN 'PARTIAL' ELSE 'OPEN' END WHERE id=?",
          id);
  }

  public Map<String, Object> state(String s) {
    session(s);
    return tx.execute(
        t -> {
          lock();
          Map<String, Object> out = new LinkedHashMap<>();
          out.put(
              "balances",
              db.queryForMap("SELECT * FROM balances WHERE session_id=? AND owner='user'", s));
          out.put(
              "orders",
              db.queryForList(
                  "SELECT * FROM orders WHERE session_id=? AND owner='user' ORDER BY created_at"
                      + " DESC LIMIT 100",
                  s));
          out.put(
              "book",
              db.queryForList(
                  "SELECT side,price,sum(remaining) AS quantity FROM orders WHERE session_id=? AND"
                      + " status IN ('OPEN','PARTIAL') GROUP BY side,price ORDER BY price DESC",
                  s));
          out.put(
              "trades",
              db.queryForList(
                  "SELECT * FROM trades WHERE session_id=? ORDER BY created_at DESC LIMIT 100", s));
          out.put(
              "ledger",
              db.queryForList(
                  "SELECT * FROM ledger WHERE session_id=? AND owner='user' ORDER BY id DESC LIMIT"
                      + " 100",
                  s));
          out.put(
              "balanced",
              db.queryForObject(
                  "SELECT count(*)=0 FROM (SELECT event_id,asset FROM ledger WHERE session_id=?"
                      + " GROUP BY event_id,asset HAVING sum(amount)<>0) q",
                  Boolean.class,
                  s));
          out.put(
              "pending",
              db.queryForObject(
                  "SELECT count(*) FROM outbox WHERE NOT done AND"
                      + " payload::jsonb->'order'->>'book'=?",
                  Integer.class,
                  s));
          out.put("delivery", deliveryError);
          return out;
        });
  }
}
