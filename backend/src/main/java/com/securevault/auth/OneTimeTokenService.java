package com.securevault.auth;

import com.securevault.common.config.Db;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Email verification and password reset tokens: 256 random bits, sent only in the email, stored
 * only as a SHA-256 hash. A fast hash is right here because the input is random rather than a
 * password a person chose, so there is nothing to guess.
 */
@Service
class OneTimeTokenService {

  private static final int TOKEN_BYTES = 32;
  private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
  private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

  private final SecureRandom random = new SecureRandom();
  private final JdbcClient jdbc;
  private final Clock clock;

  OneTimeTokenService(JdbcClient jdbc, Clock clock) {
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /** Issues a new token and cancels earlier unused ones for the same purpose. */
  @Transactional
  String issue(UUID userId, TokenPurpose purpose) {
    Instant now = clock.instant();
    jdbc.sql(
            "UPDATE one_time_tokens SET consumed_at = ?"
                + " WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL")
        .params(Db.ts(now), userId, purpose.name())
        .update();

    byte[] raw = new byte[TOKEN_BYTES];
    random.nextBytes(raw);
    jdbc.sql(
            "INSERT INTO one_time_tokens"
                + " (id, user_id, purpose, token_hash, expires_at, created_at)"
                + " VALUES (?, ?, ?, ?, ?, ?)")
        .params(
            UUID.randomUUID(),
            userId,
            purpose.name(),
            sha256(raw),
            Db.ts(now.plus(purpose.lifetime())),
            Db.ts(now))
        .update();
    return ENCODER.encodeToString(raw);
  }

  /**
   * Marks the token used and returns its owner. One conditional UPDATE does the check and the
   * change together, so two requests racing with the same token cannot both succeed.
   */
  @Transactional
  Optional<UUID> consume(String token, TokenPurpose purpose) {
    byte[] raw;
    try {
      raw = DECODER.decode(token);
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
    if (raw.length != TOKEN_BYTES) {
      return Optional.empty();
    }
    Instant now = clock.instant();
    return jdbc.sql(
            "UPDATE one_time_tokens SET consumed_at = ?"
                + " WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL"
                + " AND expires_at > ? RETURNING user_id")
        .params(Db.ts(now), sha256(raw), purpose.name(), Db.ts(now))
        .query(UUID.class)
        .optional();
  }

  @Transactional
  int deleteFinishedBefore(Instant cutoff) {
    return jdbc.sql(
            "DELETE FROM one_time_tokens WHERE expires_at < ?"
                + " OR (consumed_at IS NOT NULL AND consumed_at < ?)")
        .params(Db.ts(cutoff), Db.ts(cutoff))
        .update();
  }

  private static byte[] sha256(byte[] input) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(input);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required by every Java platform", e);
    }
  }
}
