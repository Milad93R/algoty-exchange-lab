package lab;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class Paper {
  final Exchange e;
  final Identity auth;
  final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  static final List<String> SYMBOLS = List.of("BTCUSDT", "ETHUSDT", "SOLUSDT");
  static final long INITIAL = 10000L * 100000000L;

  Paper(Exchange e, Identity auth) {
    this.e = e;
    this.auth = auth;
  }

  long n(Map<String, Object> b, String k) {
    return e.n(b, k);
  }

  String str(Map<String, Object> b, String k) {
    return String.valueOf(b.get(k));
  }

  JsonNode market(String symbol) {
    if (!SYMBOLS.contains(symbol)) throw new IllegalArgumentException("Unsupported market");
    try {
      var r =
          http.send(
              HttpRequest.newBuilder(URI.create("http://127.0.0.1:18203/market?symbol=" + symbol))
                  .timeout(Duration.ofSeconds(3))
                  .GET()
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 200) throw new Exception();
      return e.json.readTree(r.body());
    } catch (Exception ex) {
      throw new IllegalArgumentException("Market feed unavailable");
    }
  }

  long integer(Map<String, Object> b, String key) {
    Object v = b.getOrDefault(key, 0);
    if (!(v instanceof Number)
        || !Double.isFinite(((Number) v).doubleValue())
        || ((Number) v).doubleValue() != ((Number) v).longValue())
      throw new IllegalArgumentException("Integer units required for " + key);
    return ((Number) v).longValue();
  }

  long fee(long cost) {
    return cost / 1000;
  }

  long reserve(long price, long quantity) {
    long cost = Math.multiplyExact(price, quantity);
    return Math.addExact(cost, fee(cost));
  }

  String base(String symbol) {
    return symbol.replace("USDT", "");
  }

  void ledger(String event, String account, String asset, long amount, String contra) {
    e.db.update(
        "INSERT INTO v2_ledger(event_id,account_id,owner,asset,amount) VALUES (?,?,?,?,?)",
        event,
        account,
        "account",
        asset,
        amount);
    e.db.update(
        "INSERT INTO v2_ledger(event_id,account_id,owner,asset,amount) VALUES (?,?,?,?,?)",
        event,
        account,
        contra,
        asset,
        -amount);
  }

  String createAccount(String uid, String label) {
    String id = auth.id();
    e.db.update(
        "INSERT INTO v2_accounts(id,user_id,label,initial_quote) VALUES (?,?,?,?)",
        id,
        uid,
        label,
        INITIAL);
    for (String asset : List.of("USDT", "BTC", "ETH", "SOL")) {
      long amount = asset.equals("USDT") ? INITIAL : 0;
      e.db.update(
          "INSERT INTO v2_balances(account_id,asset,total) VALUES (?,?,?)", id, asset, amount);
      if (amount > 0) ledger("fund-" + id, id, asset, amount, "treasury");
    }
    return id;
  }

  String account(String uid, String id) {
    if (id == null || id.isBlank())
      return e.tx.execute(
          t -> {
            e.lock();
            var rows =
                e.db.queryForList(
                    "SELECT id FROM v2_accounts WHERE user_id=? AND label='Personal' AND NOT"
                        + " EXISTS(SELECT 1 FROM v2_missions m WHERE m.account_id=v2_accounts.id)"
                        + " ORDER BY created_at LIMIT 1",
                    uid);
            return rows.isEmpty() ? createAccount(uid, "Personal") : (String) rows.get(0).get("id");
          });
    if (e.db.queryForObject(
            "SELECT count(*) FROM v2_accounts WHERE id=? AND user_id=?", Integer.class, id, uid)
        != 1) throw new IllegalArgumentException("Account not found");
    return id;
  }

  public Map<String, Object> submit(String uid, Map<String, Object> b) {
    return e.tx.execute(
        t -> {
          e.lock();
          String a = account(uid, (String) b.get("account")),
              symbol = str(b, "symbol"),
              side = str(b, "side"),
              kind = str(b, "kind"),
              key = str(b, "key");
          if (!SYMBOLS.contains(symbol)
              || !List.of("BUY", "SELL").contains(side)
              || !List.of("MARKET", "LIMIT", "OCO").contains(kind)
              || !key.matches("[a-zA-Z0-9-]{8,100}"))
            throw new IllegalArgumentException("Invalid order fields");
          long quantity = integer(b, "quantity"),
              requestedPrice = integer(b, "price"),
              stopPrice = kind.equals("OCO") ? integer(b, "stopPrice") : 0,
              stopLimitPrice = kind.equals("OCO") ? integer(b, "stopLimitPrice") : 0;
          if (quantity < 1 || quantity > 1000000000L)
            throw new IllegalArgumentException(
                "Quantity must be positive with at most six decimal places");
          var old =
              e.db.queryForList(
                  "SELECT * FROM v2_orders WHERE account_id=? AND request_key=?", a, key);
          if (!old.isEmpty()) {
            var o = old.get(0);
            if (!o.get("symbol").equals(symbol)
                || !o.get("side").equals(side)
                || !o.get("kind").equals(kind)
                || n(o, "quantity") != quantity
                || (!kind.equals("MARKET") && n(o, "price") != requestedPrice)
                || (kind.equals("OCO")
                    && (n(o, "stop_price") != stopPrice
                        || n(o, "stop_limit_price") != stopLimitPrice)))
              throw new IllegalArgumentException("Request key reused with different order");
            return o;
          }
          if (e.db.queryForObject(
                  "SELECT count(*) FROM v2_orders WHERE account_id=?", Integer.class, a)
              >= 2000) throw new IllegalArgumentException("Account order capacity reached");
          if (e.db.queryForObject(
                  "SELECT count(*) FROM v2_orders WHERE account_id=? AND status IN"
                      + " ('OPEN','PARTIAL')",
                  Integer.class,
                  a)
              >= 20) throw new IllegalArgumentException("Maximum twenty open orders");
          JsonNode m = market(symbol);
          if (m.path("stale").asBoolean(true))
            throw new IllegalArgumentException("Market data is stale. Orders are paused.");
          long price = requestedPrice;
          if (kind.equals("MARKET")) {
            JsonNode levels = m.path(side.equals("BUY") ? "asks" : "bids");
            if (levels.isEmpty()) throw new IllegalArgumentException("No market liquidity");
            long best = levels.get(0).path("price").asLong();
            price = side.equals("BUY") ? (best * 101 + 99) / 100 : best * 99 / 100;
          }
          if (price < 1 || price > 100000000) throw new IllegalArgumentException("Invalid price");
          if (kind.equals("OCO")) {
            if (stopPrice < 1
                || stopPrice > 100000000
                || stopLimitPrice < 1
                || stopLimitPrice > 100000000)
              throw new IllegalArgumentException("Invalid OCO prices");
            JsonNode levels = m.path(side.equals("BUY") ? "asks" : "bids");
            if (levels.isEmpty()) throw new IllegalArgumentException("No market liquidity");
            long reference = levels.get(0).path("price").asLong();
            if (side.equals("SELL")
                && !(price > reference
                    && stopPrice < reference
                    && stopLimitPrice <= stopPrice))
              throw new IllegalArgumentException(
                  "Sell OCO requires the limit above market, stop below market, and stop-limit at or below the stop");
            if (side.equals("BUY")
                && !(price < reference
                    && stopPrice > reference
                    && stopLimitPrice >= stopPrice))
              throw new IllegalArgumentException(
                  "Buy OCO requires the limit below market, stop above market, and stop-limit at or above the stop");
          }
          long reservePrice =
              kind.equals("OCO") && side.equals("BUY")
                  ? Math.max(price, stopLimitPrice)
                  : price;
          long amount = side.equals("BUY") ? reserve(reservePrice, quantity) : quantity;
          String asset = side.equals("BUY") ? "USDT" : base(symbol);
          var balance =
              e.db.queryForMap(
                  "SELECT * FROM v2_balances WHERE account_id=? AND asset=? FOR UPDATE", a, asset);
          if (n(balance, "total") - n(balance, "reserved") < amount)
            throw new IllegalArgumentException("Insufficient available " + asset);
          e.db.update(
              "UPDATE v2_balances SET reserved=reserved+? WHERE account_id=? AND asset=?",
              amount,
              a,
              asset);
          String id = auth.id();
          e.db.update(
              "INSERT INTO"
                  + " v2_orders(id,account_id,symbol,side,kind,price,stop_price,stop_limit_price,reserve_price,quantity,remaining,status,after_ms,request_key)"
                  + " VALUES (?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,?)",
              id,
              a,
              symbol,
              side,
              kind,
              price,
              stopPrice,
              stopLimitPrice,
              reservePrice,
              quantity,
              quantity,
              System.currentTimeMillis(),
              key);
          return e.db.queryForMap("SELECT * FROM v2_orders WHERE id=?", id);
        });
  }

  String prepare(String id) {
    return e.tx.execute(
        t -> {
          e.lock();
          var rows =
              e.db.queryForList(
                  "SELECT * FROM v2_orders WHERE id=? AND status IN ('OPEN','PARTIAL')", id);
          if (rows.isEmpty()) return null;
          var o = rows.get(0);
          if (o.get("receipt_key") == null) {
            String key = id + "-" + n(o, "attempt");
            e.db.update("UPDATE v2_orders SET receipt_key=? WHERE id=?", key, id);
            return key;
          }
          return (String) o.get("receipt_key");
        });
  }

  String process(String id) {
    return process(id, false);
  }

  String process(String id, boolean cancel) {
    return e.tx.execute(
        t -> {
          e.lock();
          var rows =
              e.db.queryForList(
                  "SELECT * FROM v2_orders WHERE id=? AND status IN ('OPEN','PARTIAL')", id);
          if (rows.isEmpty()) return null;
          var o = rows.get(0);
          if (o.get("receipt_key") == null) return null;
          String a = str(o, "account_id"),
              side = str(o, "side"),
              symbol = str(o, "symbol"),
              key = str(o, "receipt_key");
          Map<String, Object> req = new LinkedHashMap<>();
          req.put("id", key);
          req.put("account", a);
          req.put("symbol", symbol);
          req.put("side", side);
          req.put("price", n(o, "price"));
          req.put("quantity", n(o, "remaining"));
          req.put("after", n(o, "after_ms"));
          req.put("resting", o.get("resting"));
          if (str(o, "kind").equals("OCO")) {
            req.put("kind", "OCO");
            req.put("stopPrice", n(o, "stop_price"));
            req.put("stopLimitPrice", n(o, "stop_limit_price"));
            req.put("activeLeg", str(o, "active_leg"));
          }
          JsonNode r;
          try {
            var response =
                http.send(
                    HttpRequest.newBuilder(
                            URI.create(
                                "http://127.0.0.1:18203/execute" + (cancel ? "?cancel=1" : "")))
                        .timeout(Duration.ofSeconds(3))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(e.encode(req)))
                        .build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new Exception();
            r = e.json.readTree(response.body());
          } catch (Exception ex) {
            throw new IllegalArgumentException("Execution waiting for a fresh market connection");
          }
          long remain = n(o, "remaining");
          String kind = str(o, "kind"), currentLeg = str(o, "active_leg");
          String receiptLeg = r.path("leg").asText("");
          if (kind.equals("OCO")
              && !List.of("", "LIMIT", "STOP_LIMIT").contains(receiptLeg))
            throw new IllegalStateException("Invalid OCO execution receipt");
          if (kind.equals("OCO")
              && !currentLeg.isBlank()
              && !receiptLeg.isBlank()
              && !currentLeg.equals(receiptLeg))
            throw new IllegalStateException("OCO leg changed after activation");
          String activeLeg = receiptLeg.isBlank() ? currentLeg : receiptLeg;
          long executionLimit =
              kind.equals("OCO") && activeLeg.equals("STOP_LIMIT")
                  ? n(o, "stop_limit_price")
                  : n(o, "price");
          int index = 0;
          for (JsonNode f : r.path("fills")) {
            long price = f.path("price").asLong(),
                q = f.path("quantity").asLong(),
                cost = Math.multiplyExact(price, q),
                fee = fee(cost);
            if (q < 1
                || q > remain
                || price < 1
                || (side.equals("BUY") && price > executionLimit)
                || (side.equals("SELL") && price < executionLimit)
                || (kind.equals("OCO") && activeLeg.isBlank()))
              throw new IllegalStateException("Invalid execution receipt");
            String tid = key + "-" + index++;
            if (side.equals("BUY")) {
              long reservePrice = n(o, "reserve_price");
              long released = reserve(reservePrice, remain) - reserve(reservePrice, remain - q);
              e.db.update(
                  "UPDATE v2_balances SET total=total-?,reserved=reserved-? WHERE account_id=? AND"
                      + " asset='USDT'",
                  cost + fee,
                  released,
                  a);
              e.db.update(
                  "UPDATE v2_balances SET total=total+? WHERE account_id=? AND asset=?",
                  q,
                  a,
                  base(symbol));
            } else {
              e.db.update(
                  "UPDATE v2_balances SET total=total-?,reserved=reserved-? WHERE account_id=? AND"
                      + " asset=?",
                  q,
                  q,
                  a,
                  base(symbol));
              e.db.update(
                  "UPDATE v2_balances SET total=total+? WHERE account_id=? AND asset='USDT'",
                  cost - fee,
                  a);
            }
            ledger(tid, a, "USDT", side.equals("BUY") ? -cost : cost, "market");
            ledger(tid, a, base(symbol), side.equals("BUY") ? q : -q, "market");
            ledger(tid + "-fee", a, "USDT", -fee, "fees");
            e.db.update(
                "INSERT INTO"
                    + " v2_fills(id,order_id,account_id,symbol,side,price,quantity,fee,evidence)"
                    + " VALUES (?,?,?,?,?,?,?,?,?)",
                tid,
                id,
                a,
                symbol,
                side,
                price,
                q,
                fee,
                e.encode(
                    Map.of(
                        "liquidity",
                        f.path("evidence").asText(),
                        "sequence",
                        r.path("sequence").asLong(),
                        "observedAt",
                        r.path("at").asLong(),
                        "model",
                        r.path("model").asText(),
                        "ocoLeg",
                        activeLeg)));
            remain -= q;
          }
          String status = remain == 0 ? "FILLED" : remain < n(o, "quantity") ? "PARTIAL" : "OPEN";
          e.db.update(
              "UPDATE v2_orders SET"
                  + " remaining=?,status=?,active_leg=?,resting=true,after_ms=?,attempt=attempt+1,receipt_key=NULL"
                  + " WHERE id=?",
              remain,
              status,
              activeLeg,
              r.path("at").asLong(),
              id);
          if (str(o, "kind").equals("MARKET") && remain > 0) cancelLocked(id, "CANCELED");
          return key;
        });
  }

  void ack(String key) {
    if (key == null) return;
    try {
      http.send(
          HttpRequest.newBuilder(URI.create("http://127.0.0.1:18203/ack"))
              .timeout(Duration.ofSeconds(2))
              .POST(HttpRequest.BodyPublishers.ofString(e.encode(Map.of("id", key))))
              .build(),
          HttpResponse.BodyHandlers.discarding());
    } catch (Exception ignored) {
    }
  }

  @Scheduled(fixedDelay = 700)
  public void executeOpen() {
    for (var row :
        e.db.queryForList(
            "SELECT id FROM v2_orders WHERE status IN ('OPEN','PARTIAL') ORDER BY created_at LIMIT"
                + " 100")) {
      String id = (String) row.get("id");
      try {
        prepare(id);
        ack(process(id));
      } catch (Exception ignored) {
      }
    }
  }

  void cancelLocked(String id, String status) {
    var o = e.db.queryForMap("SELECT * FROM v2_orders WHERE id=?", id);
    if (!List.of("OPEN", "PARTIAL").contains(o.get("status"))) return;
    if (o.get("receipt_key") != null)
      throw new IllegalArgumentException(
          "Execution is pending. Retry cancellation after reconnection.");
    long remain = n(o, "remaining"),
        amount =
            str(o, "side").equals("BUY") ? reserve(n(o, "reserve_price"), remain) : remain;
    String asset = str(o, "side").equals("BUY") ? "USDT" : base(str(o, "symbol"));
    e.db.update(
        "UPDATE v2_balances SET reserved=reserved-? WHERE account_id=? AND asset=?",
        amount,
        o.get("account_id"),
        asset);
    e.db.update("UPDATE v2_orders SET status=? WHERE id=?", status, id);
  }

  void cancel(String uid, String id) {
    var o =
        e.db.queryForMap(
            "SELECT o.* FROM v2_orders o JOIN v2_accounts a ON a.id=o.account_id WHERE o.id=? AND"
                + " a.user_id=?",
            id,
            uid);
    if (o.get("receipt_key") != null) process(id, true);
    e.tx.executeWithoutResult(
        t -> {
          e.lock();
          cancelLocked(id, "CANCELED");
        });
  }

  long equity(String a) {
    long total = 0;
    for (var b : e.db.queryForList("SELECT * FROM v2_balances WHERE account_id=?", a)) {
      String asset = str(b, "asset");
      if (asset.equals("USDT")) total += n(b, "total");
      else if (n(b, "total") > 0) {
        var m = market(asset + "USDT");
        if (m.path("stale").asBoolean(true) || m.path("bids").isEmpty())
          throw new IllegalArgumentException("Price unavailable");
        total += Math.multiplyExact(n(b, "total"), m.path("bids").get(0).path("price").asLong());
      }
    }
    return total;
  }

  Map<String, Object> state(String uid, String requested) {
    String a = account(uid, requested);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("account", e.db.queryForMap("SELECT * FROM v2_accounts WHERE id=?", a));
    out.put(
        "balances",
        e.db.queryForList("SELECT * FROM v2_balances WHERE account_id=? ORDER BY asset", a));
    out.put(
        "orders",
        e.db.queryForList(
            "SELECT * FROM v2_orders WHERE account_id=? ORDER BY created_at DESC LIMIT 150", a));
    out.put(
        "fills",
        e.db.queryForList(
            "SELECT * FROM v2_fills WHERE account_id=? ORDER BY created_at DESC LIMIT 200", a));
    out.put(
        "ledger",
        e.db.queryForList(
            "SELECT * FROM v2_ledger WHERE account_id=? AND owner='account' ORDER BY id DESC LIMIT"
                + " 100",
            a));
    out.put(
        "balanced",
        e.db.queryForObject(
            "SELECT NOT EXISTS(SELECT 1 FROM v2_ledger WHERE account_id=? GROUP BY event_id,asset"
                + " HAVING sum(amount)<>0)",
            Boolean.class,
            a));
    try {
      out.put("equity", equity(a));
    } catch (Exception ex) {
      out.put("equity", null);
    }
    out.put(
        "fees",
        e.db.queryForObject(
            "SELECT COALESCE(sum(fee),0) FROM v2_fills WHERE account_id=?", Long.class, a));
    out.put("feeBps", 10);
    out.put("positions", positions(a));
    out.put("valuationFresh", out.get("equity") != null);
    return out;
  }

  List<Map<String, Object>> positions(String a) {
    List<Map<String, Object>> result = new ArrayList<>();
    for (String symbol : SYMBOLS) {
      double quantity = 0, cost = 0, realized = 0;
      for (var f :
          e.db.queryForList(
              "SELECT side,price,quantity,fee FROM v2_fills WHERE account_id=? AND symbol=? ORDER"
                  + " BY created_at,id",
              a,
              symbol)) {
        double q = n(f, "quantity"), v = n(f, "price") * q;
        if (f.get("side").equals("BUY")) {
          quantity += q;
          cost += v + n(f, "fee");
        } else {
          double basis = quantity > 0 ? cost * q / quantity : 0;
          realized += v - n(f, "fee") - basis;
          quantity -= q;
          cost -= basis;
          if (quantity <= 0) {
            quantity = 0;
            cost = 0;
          }
        }
      }
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("symbol", symbol);
      row.put("quantity", (long) quantity);
      row.put("entryPrice", quantity > 0 ? cost / quantity / 100 : 0);
      row.put("realized", Math.round(realized));
      row.put("cost", Math.round(cost));
      try {
        var m = market(symbol);
        if (m.path("stale").asBoolean(true)) throw new IllegalArgumentException();
        row.put(
            "unrealized",
            Math.round(quantity * m.path("bids").get(0).path("price").asLong() - cost));
      } catch (Exception ex) {
        row.put("unrealized", null);
      }
      result.add(row);
    }
    return result;
  }
}
