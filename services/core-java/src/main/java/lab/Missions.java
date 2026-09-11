package lab;

import com.fasterxml.jackson.core.type.TypeReference;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class Missions {
  final Exchange e;
  final Paper p;
  final Identity auth;
  final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

  Missions(Exchange e, Paper p, Identity auth) {
    this.e = e;
    this.p = p;
    this.auth = auth;
  }

  Map<String, Object> parse(String s) {
    try {
      return e.json.readValue(s, new TypeReference<Map<String, Object>>() {});
    } catch (Exception ex) {
      throw new IllegalArgumentException("Invalid mission plan");
    }
  }

  double num(Map<String, Object> b, String k) {
    Object v = b.get(k);
    if (!(v instanceof Number) || !Double.isFinite(((Number) v).doubleValue()))
      throw new IllegalArgumentException("Invalid " + k);
    return ((Number) v).doubleValue();
  }

  void range(Map<String, Object> b, String k, double low, double high) {
    double v = num(b, k);
    if (v < low || v > high)
      throw new IllegalArgumentException(k + " must be between " + low + " and " + high);
  }

  Map<String, Object> validate(Map<String, Object> b) {
    if (!Paper.SYMBOLS.contains(String.valueOf(b.get("symbol")))
        || !List.of("BREAKOUT", "MA_CROSS", "RSI_REVERSION", "CUSTOM")
            .contains(String.valueOf(b.get("strategy")))
        || !("CUSTOM".equals(b.get("strategy"))
                ? List.of("1m", "5m", "15m", "1h")
                : List.of("1m", "5m"))
            .contains(String.valueOf(b.get("timeframe"))))
      throw new IllegalArgumentException("Unsupported symbol, strategy or timeframe");
    range(b, "lookback", 5, 50);
    range(b, "fast", 2, 20);
    range(b, "slow", 5, 50);
    if (num(b, "fast") >= num(b, "slow"))
      throw new IllegalArgumentException("Fast period must be shorter than slow period");
    range(b, "volumeRatio", 0, 5);
    range(b, "confirmationBars", 1, 3);
    range(b, "orderQuote", 10, 2000);
    range(b, "maxPositionQuote", 10, 10000);
    range(b, "dailyTrades", 1, 20);
    range(b, "stopLossPct", .1, 20);
    range(b, "takeProfitPct", "CUSTOM".equals(b.get("strategy")) ? 0 : .1, 50);
    range(b, "durationHours", 1, 168);
    for (String k :
        List.of("lookback", "fast", "slow", "confirmationBars", "dailyTrades", "durationHours"))
      if (num(b, k) != Math.floor(num(b, k)))
        throw new IllegalArgumentException("Integer field: " + k);
    if (num(b, "orderQuote") > num(b, "maxPositionQuote"))
      throw new IllegalArgumentException("Order allocation exceeds position budget");
    if (!(b.get("name") instanceof String) || ((String) b.get("name")).length() > 80)
      throw new IllegalArgumentException("Invalid mission name");
    if (!(b.get("questions") instanceof List<?>))
      throw new IllegalArgumentException("Questions must be a list");
    if (((String) b.get("name")).isBlank())
      throw new IllegalArgumentException("Mission name is required");
    var questions = (List<?>) b.get("questions");
    if (questions.size() > 10
        || questions.stream().anyMatch(q -> !(q instanceof String) || ((String) q).length() > 500))
      throw new IllegalArgumentException("Questions must contain short text");
    if (!(b.get("summary") instanceof String) || ((String) b.get("summary")).length() > 2000)
      throw new IllegalArgumentException("A short plan summary is required");
    if ("CUSTOM".equals(b.get("strategy"))) ai("validate", Map.of("plan", b));
    else if (b.containsKey("flow"))
      throw new IllegalArgumentException("Flow requires CUSTOM strategy");
    return b;
  }

  Map<String, Object> ai(String route, Map<String, Object> b) {
    try {
      var r =
          client.send(
              HttpRequest.newBuilder(URI.create("http://127.0.0.1:18205/" + route))
                  .timeout(Duration.ofSeconds(50))
                  .header("Content-Type", "application/json")
                  .header(
                      "X-Worker-Token",
                      System.getenv().getOrDefault("AI_INTERNAL_TOKEN", "disabled"))
                  .POST(HttpRequest.BodyPublishers.ofString(e.encode(b)))
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 200)
        throw new IllegalArgumentException(
            "AI service could not complete this request. Your accounts are unchanged.");
      return parse(r.body());
    } catch (IllegalArgumentException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalArgumentException("AI is temporarily unavailable. Retry shortly.");
    }
  }

  Map<String, Object> own(String uid, String id) {
    return e.db.queryForMap("SELECT * FROM v2_missions WHERE id=? AND user_id=?", id, uid);
  }

  void event(String id, String kind, String message, Object evidence) {
    e.db.update(
        "INSERT INTO v2_events(mission_id,kind,message,evidence) VALUES (?,?,?,?)",
        id,
        kind,
        message,
        e.encode(evidence));
  }

  Map<String, Object> insert(
      String uid,
      String brief,
      Map<String, Object> plan,
      String parent,
      int version,
      String group) {
    String id = auth.id(), account = p.createAccount(uid, (String) plan.get("name"));
    e.db.update(
        "INSERT INTO v2_missions(id,user_id,account_id,brief,plan,parent_id,version,group_id)"
            + " VALUES (?,?,?,?,?,?,?,?)",
        id,
        uid,
        account,
        brief,
        e.encode(validate(plan)),
        parent,
        version,
        group);
    event(
        id, "PLAN", "Mission prepared. Review and activate to begin.", Map.of("version", version));
    return detail(uid, id);
  }

  Map<String, Object> draft(String uid, Map<String, Object> b) {
    String brief = String.valueOf(b.getOrDefault("brief", ""));
    if (brief.length() < 12 || brief.length() > 2500)
      throw new IllegalArgumentException("Describe your mission in 12–2500 characters");
    if (e.db.queryForObject(
            "SELECT count(*) FROM v2_missions WHERE user_id=? AND created_at>now()-interval '1"
                + " hour'",
            Integer.class,
            uid)
        >= 10) throw new IllegalArgumentException("Hourly mission limit reached");
    auth.throttle("ai-" + uid);
    var ai = ai("plan", Map.of("brief", brief));
    var plan = (Map<String, Object>) ai.get("plan");
    validate(plan);
    plan.put("model", ai.getOrDefault("model", "unknown"));
    return e.tx.execute(
        t -> {
          e.lock();
          return insert(uid, brief, plan, null, 1, null);
        });
  }

  Map<String, Object> manual(String uid, Map<String, Object> plan) {
    auth.throttle("draft-" + uid);
    validate(plan);
    return e.tx.execute(
        t -> {
          e.lock();
          return insert(uid, "User-authored flow", plan, null, 1, null);
        });
  }

  Map<String, Object> replay(String uid, String id, Map<String, Object> options) {
    var m = own(uid, id);
    auth.throttle("replay-" + uid);
    var plan = parse((String) m.get("plan"));
    var result =
        ai("replay", Map.of("plan", plan, "slippageBps", options.getOrDefault("slippageBps", 5)));
    // Store only provenance/summary; the full replay is returned to its owner.
    event(
        id,
        "REPLAY",
        "Historical replay completed",
        Map.of(
            "version",
            m.get("version"),
            "bars",
            result.get("bars"),
            "returnPct",
            result.get("returnPct"),
            "model",
            result.get("model")));
    return result;
  }

  List<Map<String, Object>> list(String uid) {
    var rows =
        e.db.queryForList(
            "SELECT * FROM v2_missions WHERE user_id=? ORDER BY created_at DESC LIMIT 100", uid);
    for (var row : rows) {
      row.put("plan", parse((String) row.get("plan")));
      try {
        row.put("equity", p.equity((String) row.get("account_id")));
      } catch (Exception ex) {
        row.put("equity", null);
      }
    }
    return rows;
  }

  Map<String, Object> detail(String uid, String id) {
    var m = own(uid, id);
    m.put("plan", parse((String) m.get("plan")));
    m.put(
        "events",
        e.db.queryForList(
            "SELECT id,kind,message,evidence,created_at FROM v2_events WHERE mission_id=? ORDER BY"
                + " id DESC LIMIT 120",
            id));
    m.put(
        "curve",
        e.db.queryForList(
            "SELECT equity,created_at FROM (SELECT id,equity,created_at,row_number() OVER (ORDER BY"
                + " id) AS rn,count(*) OVER () AS total FROM v2_equity WHERE mission_id=?) sampled"
                + " WHERE rn=1 OR rn=total OR mod(rn,GREATEST(1,ceil(total/1500.0)::bigint))=0"
                + " ORDER BY id",
            id));
    m.put("portfolio", p.state(uid, (String) m.get("account_id")));
    return m;
  }

  Map<String, Object> edit(String uid, String id, Map<String, Object> plan) {
    validate(plan);
    return e.tx.execute(
        t -> {
          e.lock();
          var old = own(uid, id);
          if (old.get("status").equals("DRAFT")) {
            e.db.update("UPDATE v2_missions SET plan=? WHERE id=?", e.encode(plan), id);
            event(id, "EDIT", "Draft updated", Map.of());
            return detail(uid, id);
          }
          return insert(
              uid,
              (String) old.get("brief"),
              plan,
              id,
              ((Number) old.get("version")).intValue() + 1,
              null);
        });
  }

  Map<String, Object> control(String uid, String id, String action) {
    return e.tx.execute(
        t -> {
          e.lock();
          var m = own(uid, id);
          var plan = parse((String) m.get("plan"));
          if (action.equals("activate") || action.equals("resume")) {
            if (!(action.equals("activate") && m.get("status").equals("DRAFT"))
                && !(action.equals("resume") && m.get("status").equals("PAUSED")))
              throw new IllegalArgumentException(
                  "This mission cannot be started from its current state");
            if (((List<?>) plan.get("questions")).size() > 0)
              throw new IllegalArgumentException("Resolve the open questions before activating");
            if (m.get("status").equals("STOPPED") || m.get("status").equals("EXPIRED"))
              throw new IllegalArgumentException(
                  "Create a new version to restart a finished mission");
            if (m.get("group_id") != null && !m.get("status").equals("PAUSED"))
              throw new IllegalArgumentException("Start both comparison agents together");
            if (e.db.queryForObject(
                    "SELECT count(*) FROM v2_missions WHERE user_id=? AND status='ACTIVE'",
                    Integer.class,
                    uid)
                >= 4) throw new IllegalArgumentException("Maximum four active missions");
            var market = p.market((String) plan.get("symbol"));
            if (market.path("stale").asBoolean())
              throw new IllegalArgumentException("Wait for fresh market data");
            e.db.update(
                "UPDATE v2_missions SET"
                    + " status='ACTIVE',started_at=COALESCE(started_at,now()),expires_at=COALESCE(expires_at,now()+(?*interval"
                    + " '1 hour')) WHERE id=?",
                num(plan, "durationHours"),
                id);
            event(id, "ACTIVE", "Mission is watching new closed candles", Map.of());
          } else if (action.equals("pause") || action.equals("stop")) {
            if (action.equals("pause") && !List.of("ACTIVE", "PAUSED").contains(m.get("status")))
              throw new IllegalArgumentException("Only a running mission can be paused");
            e.db.update(
                "UPDATE v2_missions SET status=? WHERE id=?",
                action.equals("pause") ? "PAUSED" : "STOPPED",
                id);
            for (var o :
                e.db.queryForList(
                    "SELECT id FROM v2_orders WHERE account_id=? AND status IN ('OPEN','PARTIAL')",
                    m.get("account_id"))) p.cancel(uid, (String) o.get("id"));
            event(
                id,
                "CONTROL",
                action.equals("pause")
                    ? "Paused; open orders canceled. Holdings remain in the account."
                    : "Stopped; open orders canceled. Holdings remain in the account.",
                Map.of());
          } else throw new IllegalArgumentException("Unknown action");
          return detail(uid, id);
        });
  }

  Map<String, Object> previewControl(String uid, String id, String instruction) {
    var m = own(uid, id);
    if (instruction.length() < 3 || instruction.length() > 1000)
      throw new IllegalArgumentException("Enter a short instruction");
    auth.throttle("ai-" + uid);
    return ai(
        "control",
        Map.of(
            "instruction",
            instruction,
            "plan",
            parse((String) m.get("plan")),
            "status",
            m.get("status")));
  }

  Map<String, Object> branch(String uid, String id, Map<String, Object> b) {
    var m = own(uid, id);
    String brief =
        String.valueOf(
            b.getOrDefault(
                "brief", "Create a second version that waits for two confirming candles"));
    if (brief.length() < 12 || brief.length() > 1500)
      throw new IllegalArgumentException("Variation must be 12–1500 characters");
    auth.throttle("ai-" + uid);
    var result = ai("plan", Map.of("brief", brief, "basePlan", parse((String) m.get("plan"))));
    var variant = validate((Map<String, Object>) result.get("plan"));
    return e.tx.execute(
        t -> {
          e.lock();
          String group = auth.id();
          var first =
              insert(
                  uid,
                  (String) m.get("brief"),
                  parse((String) m.get("plan")),
                  id,
                  ((Number) m.get("version")).intValue() + 1,
                  group);
          var second =
              insert(uid, brief, variant, id, ((Number) m.get("version")).intValue() + 1, group);
          return Map.of("group", group, "agents", List.of(first, second));
        });
  }

  Map<String, Object> startGroup(String uid, String group) {
    return e.tx.execute(
        t -> {
          e.lock();
          var ms =
              e.db.queryForList(
                  "SELECT * FROM v2_missions WHERE user_id=? AND group_id=? ORDER BY id",
                  uid,
                  group);
          if (ms.size() != 2 || ms.stream().anyMatch(m -> !m.get("status").equals("DRAFT")))
            throw new IllegalArgumentException("Comparison needs two fresh drafts");
          if (e.db.queryForObject(
                  "SELECT count(*) FROM v2_missions WHERE user_id=? AND status='ACTIVE'",
                  Integer.class,
                  uid)
              > 2) throw new IllegalArgumentException("Pause another mission first");
          for (var m : ms) {
            var plan = validate(parse((String) m.get("plan")));
            if (!((List<?>) plan.get("questions")).isEmpty())
              throw new IllegalArgumentException("Resolve both plans first");
            if (p.market((String) plan.get("symbol")).path("stale").asBoolean())
              throw new IllegalArgumentException("Market data is stale");
            e.db.update(
                "UPDATE v2_missions SET"
                    + " status='ACTIVE',started_at=now(),expires_at=now()+(?*interval '1 hour')"
                    + " WHERE id=?",
                num(plan, "durationHours"),
                m.get("id"));
            event(
                (String) m.get("id"),
                "ACTIVE",
                "Paired comparison started with equal virtual capital",
                Map.of("group", group));
          }
          return Map.of("group", group, "started", true);
        });
  }

  List<Map<String, Object>> work() {
    var ms =
        e.db.queryForList(
            "SELECT * FROM v2_missions WHERE status='ACTIVE' AND expires_at>now() ORDER BY"
                + " created_at LIMIT 30");
    for (var m : ms) {
      m.put("plan", parse((String) m.get("plan")));
      m.put("portfolio", p.state((String) m.get("user_id"), (String) m.get("account_id")));
      m.put("flowState", parse((String) m.get("flow_state")));
    }
    return ms;
  }

  Map<String, Object> decision(Map<String, Object> b) {
    return e.tx.execute(
        t -> {
          e.lock();
          String id = (String) b.get("mission");
          var m = e.db.queryForMap("SELECT * FROM v2_missions WHERE id=?", id);
          if (!m.get("status").equals("ACTIVE")
              || m.get("expires_at") == null
              || ((java.sql.Timestamp) m.get("expires_at")).getTime() <= System.currentTimeMillis())
            return Map.of("skipped", true);
          long bar = ((Number) b.get("bar")).longValue();
          if (bar <= ((Number) m.get("last_bar")).longValue()) return Map.of("duplicate", true);
          if (bar < ((java.sql.Timestamp) m.get("started_at")).getTime()
              || bar > System.currentTimeMillis())
            throw new IllegalArgumentException("Decision must use a new, closed candle");
          var plan = parse((String) m.get("plan"));
          String a = (String) m.get("account_id"),
              uid = (String) m.get("user_id"),
              action = String.valueOf(b.get("action")),
              message = String.valueOf(b.get("message"));
          var evidence = b.getOrDefault("evidence", Map.of());
          e.db.update("UPDATE v2_missions SET last_bar=? WHERE id=?", bar, id);
          if (!List.of("BUY", "SELL", "WAIT").contains(action))
            throw new IllegalArgumentException("Invalid agent decision");
          if ("CUSTOM".equals(plan.get("strategy"))
              && evidence instanceof Map<?, ?> ev
              && ev.get("nextState") instanceof Map<?, ?> state) {
            Object peak = state.get("peak");
            if (!(peak instanceof Number)
                || !Double.isFinite(((Number) peak).doubleValue())
                || ((Number) peak).doubleValue() < 0)
              throw new IllegalArgumentException("Invalid flow state");
            e.db.update(
                "UPDATE v2_missions SET flow_state=? WHERE id=?",
                e.encode(Map.of("peak", peak)),
                id);
          }
          if (action.equals("WAIT")) {
            event(id, "WAIT", message, evidence);
            return Map.of("recorded", true);
          }
          var market = p.market((String) plan.get("symbol"));
          if (market.path("stale").asBoolean()) {
            event(id, "BLOCKED", "Fresh market data is required", evidence);
            return Map.of("blocked", true);
          }
          if (e.db.queryForObject(
                  "SELECT count(*) FROM v2_orders WHERE account_id=? AND status IN"
                      + " ('OPEN','PARTIAL')",
                  Integer.class,
                  a)
              > 0) {
            event(id, "BLOCKED", "An earlier order is still pending", evidence);
            return Map.of("blocked", true);
          }
          long count =
              e.db.queryForObject(
                  "SELECT count(*) FROM v2_orders WHERE account_id=? AND side='BUY' AND"
                      + " created_at>=date_trunc('day',now())",
                  Long.class,
                  a);
          if (count >= num(plan, "dailyTrades") && action.equals("BUY")) {
            event(id, "BLOCKED", "Daily entry limit reached", evidence);
            return Map.of("blocked", true);
          }
          String asset = p.base((String) plan.get("symbol"));
          var balances =
              e.db.queryForMap(
                  "SELECT * FROM v2_balances WHERE account_id=? AND asset=?", a, asset);
          long holding = p.n(balances, "total"), q;
          long ask = market.path("asks").get(0).path("price").asLong();
          if (action.equals("BUY")) {
            Map<String, Object> risk =
                "CUSTOM".equals(plan.get("strategy"))
                    ? (Map<String, Object>)
                        ((Map<String, Object>) plan.get("flow")).getOrDefault("risk", Map.of())
                    : Map.of();
            int maxEntries = ((Number) risk.getOrDefault("maxEntries", 1)).intValue();
            var history =
                e.db.queryForList(
                    "SELECT order_id,side,quantity,created_at FROM v2_fills WHERE account_id=? AND"
                        + " symbol=? ORDER BY created_at,id",
                    a,
                    plan.get("symbol"));
            long inventory = 0;
            Set<Object> entries = new HashSet<>();
            long lastFill = 0;
            for (var f : history) {
              inventory +=
                  ((Number) f.get("quantity")).longValue() * ("BUY".equals(f.get("side")) ? 1 : -1);
              if ("BUY".equals(f.get("side"))) entries.add(f.get("order_id"));
              if (inventory <= 0) entries.clear();
              lastFill = ((java.sql.Timestamp) f.get("created_at")).getTime();
            }
            long step =
                switch ((String) plan.get("timeframe")) {
                  case "5m" -> 300000;
                  case "15m" -> 900000;
                  case "1h" -> 3600000;
                  default -> 60000;
                };
            if (holding > 0 && entries.size() >= maxEntries
                || bar - lastFill
                    < ((Number) risk.getOrDefault("cooldownBars", 0)).longValue() * step) {
              event(id, "BLOCKED", "Entry count or cooldown limit reached", evidence);
              return Map.of("blocked", true);
            }
            if ("CUSTOM".equals(plan.get("strategy"))) {
              var day =
                  e.db.queryForList(
                      "SELECT equity FROM v2_equity WHERE mission_id=? AND"
                          + " created_at>=date_trunc('day',now()) ORDER BY id LIMIT 1",
                      id);
              long start =
                  day.isEmpty() ? Paper.INITIAL : ((Number) day.get(0).get("equity")).longValue();
              if (p.equity(a)
                  <= start
                      * (1 - ((Number) risk.getOrDefault("dailyLossPct", 5)).doubleValue() / 100)) {
                event(id, "BLOCKED", "Daily equity loss limit reached", evidence);
                return Map.of("blocked", true);
              }
            }
            long budget =
                (long)
                    (Math.min(
                            num(plan, "orderQuote"),
                            Math.max(
                                0, num(plan, "maxPositionQuote") - holding * ask / 100000000.0))
                        * 100000000);
            q = budget / (ask * 102 / 100 + 1);
          } else {
            q = holding - p.n(balances, "reserved");
            if ("CUSTOM".equals(plan.get("strategy"))
                && evidence instanceof Map<?, ?> ev
                && !Boolean.TRUE.equals(ev.get("protectiveExit"))) {
              var risk =
                  (Map<String, Object>)
                      ((Map<String, Object>) plan.get("flow")).getOrDefault("risk", Map.of());
              q = (long) (q * ((Number) risk.getOrDefault("exitPercent", 100)).doubleValue() / 100);
            }
          }
          if (q < 1) {
            event(id, "WAIT", "No executable quantity", evidence);
            return Map.of("recorded", true);
          }
          var order =
              p.submit(
                  uid,
                  Map.of(
                      "account",
                      a,
                      "symbol",
                      plan.get("symbol"),
                      "side",
                      action,
                      "kind",
                      "MARKET",
                      "quantity",
                      q,
                      "price",
                      0,
                      "key",
                      "agent-" + id + "-" + bar));
          event(id, "ORDER", message, Map.of("order", order.get("id"), "signal", evidence));
          return Map.of("order", order);
        });
  }

  @Scheduled(fixedDelay = 15000)
  public void sample() {
    for (var m :
        e.db.queryForList("SELECT * FROM v2_missions WHERE status IN ('ACTIVE','PAUSED')")) {
      try {
        if (m.get("expires_at") != null
            && ((java.sql.Timestamp) m.get("expires_at")).getTime() < System.currentTimeMillis()) {
          control((String) m.get("user_id"), (String) m.get("id"), "stop");
          e.db.update("UPDATE v2_missions SET status='EXPIRED' WHERE id=?", m.get("id"));
          continue;
        }
        long equity = p.equity((String) m.get("account_id"));
        e.db.update("INSERT INTO v2_equity(mission_id,equity) VALUES (?,?)", m.get("id"), equity);
      } catch (Exception ignored) {
      }
    }
  }

  Map<String, Object> share(String uid, String group) {
    if (e.db.queryForObject(
            "SELECT count(*) FROM v2_missions WHERE user_id=? AND group_id=?",
            Integer.class,
            uid,
            group)
        != 2) throw new IllegalArgumentException("Comparison not found");
    var existing =
        e.db.queryForList("SELECT token FROM v2_shares WHERE user_id=? AND group_id=?", uid, group);
    if (!existing.isEmpty()) return Map.of("token", existing.get(0).get("token"));
    String token = auth.secret();
    e.db.update("INSERT INTO v2_shares VALUES (?,?,?,now())", token, uid, group);
    return Map.of("token", token);
  }

  Map<String, Object> publicShare(String token) {
    var s = e.db.queryForMap("SELECT * FROM v2_shares WHERE token=?", token);
    var ms =
        e.db.queryForList(
            "SELECT id,plan,status,version,started_at,account_id FROM v2_missions WHERE user_id=?"
                + " AND group_id=? ORDER BY id",
            s.get("user_id"),
            s.get("group_id"));
    for (var m : ms) {
      var plan = parse((String) m.get("plan"));
      m.put("plan", plan);
      m.put(
          "curve",
          e.db.queryForList(
              "SELECT equity,created_at FROM (SELECT id,equity,created_at,row_number() OVER (ORDER"
                  + " BY id) AS rn,count(*) OVER () AS total FROM v2_equity WHERE mission_id=?)"
                  + " sampled WHERE rn=1 OR rn=total OR"
                  + " mod(rn,GREATEST(1,ceil(total/1500.0)::bigint))=0 ORDER BY id",
              m.get("id")));
      m.put(
          "fills",
          e.db.queryForList(
              "SELECT symbol,side,price,quantity,fee,created_at FROM v2_fills WHERE account_id=?"
                  + " ORDER BY created_at",
              m.remove("account_id")));
    }
    return Map.of("agents", ms, "initialQuote", Paper.INITIAL, "mode", "paper");
  }
}
