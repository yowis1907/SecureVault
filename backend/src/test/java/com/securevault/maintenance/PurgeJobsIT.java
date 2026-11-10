package com.securevault.maintenance;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiTestBase;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PurgeJobsIT extends ApiTestBase {

  @Autowired private PurgeJobs purgeJobs;

  private UUID insertUser(Instant createdAt, boolean verified) {
    UUID id = UUID.randomUUID();
    Timestamp at = Timestamp.from(createdAt);
    jdbc.update(
        "INSERT INTO users (id, email, password_hash, email_verified_at, password_changed_at,"
            + " created_at, updated_at) VALUES (?, ?, 'test-hash', ?, ?, ?, ?)",
        id,
        id + "@example.test",
        verified ? at : null,
        at,
        at,
        at);
    return id;
  }

  private boolean exists(String sql, Object id) {
    return jdbc.queryForObject(sql, Long.class, id) > 0;
  }

  @Test
  void removesOnlyWhatIsPastItsRetentionPeriod() {
    Instant now = clock.instant();
    UUID staleUnverified = insertUser(now.minus(Duration.ofHours(25)), false);
    UUID freshUnverified = insertUser(now.minus(Duration.ofHours(23)), false);
    UUID oldVerified = insertUser(now.minus(Duration.ofDays(400)), true);

    UUID oldToken = UUID.randomUUID();
    UUID liveToken = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO one_time_tokens (id, user_id, purpose, token_hash, expires_at, created_at)"
            + " VALUES (?, ?, 'PASSWORD_RESET', ?, ?, ?), (?, ?, 'PASSWORD_RESET', ?, ?, ?)",
        oldToken,
        oldVerified,
        randomBytes(32),
        Timestamp.from(now.minus(Duration.ofDays(8))),
        Timestamp.from(now.minus(Duration.ofDays(8))),
        liveToken,
        oldVerified,
        randomBytes(32),
        Timestamp.from(now.plus(Duration.ofMinutes(20))),
        Timestamp.from(now));

    jdbc.update(
        "INSERT INTO audit_events (user_id, event_type, occurred_at) VALUES (?, 'LOGIN_SUCCEEDED', ?),"
            + " (?, 'LOGIN_SUCCEEDED', ?)",
        oldVerified,
        Timestamp.from(now.minus(Duration.ofDays(91))),
        oldVerified,
        Timestamp.from(now.minus(Duration.ofDays(89))));

    purgeJobs.runAll();

    assertThat(exists("SELECT count(*) FROM users WHERE id = ?", staleUnverified)).isFalse();
    assertThat(exists("SELECT count(*) FROM users WHERE id = ?", freshUnverified)).isTrue();
    assertThat(exists("SELECT count(*) FROM users WHERE id = ?", oldVerified)).isTrue();
    assertThat(exists("SELECT count(*) FROM one_time_tokens WHERE id = ?", oldToken)).isFalse();
    assertThat(exists("SELECT count(*) FROM one_time_tokens WHERE id = ?", liveToken)).isTrue();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_events WHERE user_id = ?", Long.class, oldVerified))
        .isEqualTo(1);
  }
}
