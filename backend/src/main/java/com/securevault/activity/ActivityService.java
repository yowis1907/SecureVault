package com.securevault.activity;

import com.securevault.common.config.Db;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The audit trail. Stores no IP addresses, user agents, or anything from inside a record. */
@Service
public class ActivityService {

  public record ActivityEvent(long id, ActivityType type, UUID recordId, Instant occurredAt) {}

  private final JdbcClient jdbc;
  private final Clock clock;

  public ActivityService(JdbcClient jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  @Transactional
  public void record(UUID userId, ActivityType type) {
    record(userId, type, null);
  }

  @Transactional
  public void record(UUID userId, ActivityType type, UUID recordId) {
    jdbc.sql(
            "INSERT INTO audit_events (user_id, event_type, record_id, occurred_at)"
                + " VALUES (?, ?, ?, ?)")
        .params(userId, type.name(), recordId, Db.ts(clock.instant()))
        .update();
  }

  @Transactional(readOnly = true)
  public List<ActivityEvent> latest(UUID userId, int limit) {
    return jdbc.sql(
            "SELECT id, event_type, record_id, occurred_at FROM audit_events WHERE user_id = ?"
                + " ORDER BY occurred_at DESC, id DESC LIMIT ?")
        .params(userId, limit)
        .query((rs, i) ->
            new ActivityEvent(
                rs.getLong("id"),
                ActivityType.valueOf(rs.getString("event_type")),
                rs.getObject("record_id", UUID.class),
                Db.instant(rs, "occurred_at")))
        .list();
  }

  @Transactional
  public int deleteOlderThan(Instant cutoff) {
    return jdbc.sql("DELETE FROM audit_events WHERE occurred_at < ?").param(Db.ts(cutoff)).update();
  }
}
