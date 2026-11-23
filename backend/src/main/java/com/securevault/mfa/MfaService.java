package com.securevault.mfa;

import com.securevault.account.StepUpService;
import com.securevault.account.UserService;
import com.securevault.account.UserView;
import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.config.Db;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.common.ratelimit.RateLimitRule;
import com.securevault.common.ratelimit.RateLimiter;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import org.bouncycastle.util.encoders.Base32;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Two-factor sign-in with TOTP, ADR 0015. Turning it on or off needs the account password (step up)
 * and a valid code; signing in needs a code after the password. Ten one-time recovery codes cover a
 * lost phone. This protects the account sign-in only: the vault is still opened by the master
 * password, which the server never sees.
 */
@Service
public class MfaService {

  public record Status(boolean enabled, int recoveryCodesRemaining) {}

  public record Setup(String secret, String otpauthUri) {}

  /** What a successful code check used, so callers can tell the user a recovery code was spent. */
  public enum Factor {
    AUTHENTICATOR,
    RECOVERY_CODE
  }

  private static final int SECRET_BYTES = 20;
  private static final int RECOVERY_CODES = 10;
  private static final int RECOVERY_CODE_LENGTH = 12;

  /** Unambiguous characters: no 0/O, 1/I/L, or U. 12 of them give about 59 bits. */
  private static final String RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

  private record Row(byte[] ciphertext, byte[] nonce, Instant enabledAt, Long lastUsedStep) {}

  private final JdbcClient jdbc;
  private final Clock clock;
  private final MfaSecretCipher cipher;
  private final StepUpService stepUp;
  private final UserService users;
  private final ActivityService activity;
  private final SecureRandom random = new SecureRandom();

  /** Code attempts per account, on top of the per-IP limit at sign-in. */
  private final RateLimiter codeAttempts =
      new RateLimiter(new RateLimitRule("mfa-code", 10, Duration.ofMinutes(15)));

  public MfaService(
      JdbcClient jdbc,
      Clock clock,
      MfaSecretCipher cipher,
      StepUpService stepUp,
      UserService users,
      ActivityService activity) {
    this.jdbc = jdbc;
    this.clock = clock;
    this.cipher = cipher;
    this.stepUp = stepUp;
    this.users = users;
    this.activity = activity;
  }

  @Transactional(readOnly = true)
  public boolean isEnabled(UUID userId) {
    return row(userId).map(r -> r.enabledAt() != null).orElse(false);
  }

  @Transactional(readOnly = true)
  public Status status(UUID userId) {
    boolean enabled = isEnabled(userId);
    int remaining =
        enabled
            ? jdbc.sql(
                    "SELECT count(*) FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL")
                .param(userId)
                .query(Integer.class)
                .single()
            : 0;
    return new Status(enabled, remaining);
  }

  /** Starts (or restarts) setup with a fresh secret. Nothing changes at sign-in until confirmed. */
  @Transactional
  public Setup beginSetup(UUID userId, String accountPassword) {
    stepUp.verify(userId, accountPassword);
    if (isEnabled(userId)) {
      throw new ApiException(ErrorCode.MFA_STATE_CONFLICT);
    }
    byte[] secret = new byte[SECRET_BYTES];
    random.nextBytes(secret);
    MfaSecretCipher.Sealed sealed = cipher.seal(userId, secret);
    jdbc.sql(
            "INSERT INTO user_mfa (user_id, secret_ciphertext, secret_nonce, created_at)"
                + " VALUES (?, ?, ?, ?)"
                + " ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext,"
                + " secret_nonce = EXCLUDED.secret_nonce, enabled_at = NULL, last_used_step = NULL,"
                + " created_at = EXCLUDED.created_at")
        .params(userId, sealed.ciphertext(), sealed.nonce(), Db.ts(clock.instant()))
        .update();
    String base32 = Base32.toBase32String(secret);
    Arrays.fill(secret, (byte) 0);
    String email = users.findView(userId).map(UserView::email).orElse("account");
    return new Setup(base32, otpauthUri(email, base32));
  }

  /** Confirms setup with a first code from the app, turns 2FA on, and returns recovery codes. */
  @Transactional
  public List<String> confirmSetup(UUID userId, String code) {
    codeAttempts.consume(userId.toString());
    Row row = row(userId).orElseThrow(() -> new ApiException(ErrorCode.MFA_STATE_CONFLICT));
    if (row.enabledAt() != null) {
      throw new ApiException(ErrorCode.MFA_STATE_CONFLICT);
    }
    String normalized = normalize(code);
    if (!normalized.matches("\\d{6}")) {
      throw new ApiException(ErrorCode.INVALID_MFA_CODE);
    }
    byte[] secret = cipher.open(userId, row.ciphertext(), row.nonce());
    OptionalLong step;
    try {
      step = Totp.match(secret, normalized, clock.instant(), null);
    } finally {
      Arrays.fill(secret, (byte) 0);
    }
    if (step.isEmpty()) {
      throw new ApiException(ErrorCode.INVALID_MFA_CODE);
    }
    jdbc.sql("UPDATE user_mfa SET enabled_at = ?, last_used_step = ? WHERE user_id = ?")
        .params(Db.ts(clock.instant()), step.getAsLong(), userId)
        .update();
    List<String> codes = replaceRecoveryCodes(userId);
    activity.record(userId, ActivityType.MFA_ENABLED);
    return codes;
  }

  /** Turns 2FA off. Needs the account password and a current code or a recovery code. */
  @Transactional
  public void disable(UUID userId, String accountPassword, String code) {
    stepUp.verify(userId, accountPassword);
    if (!isEnabled(userId)) {
      throw new ApiException(ErrorCode.MFA_STATE_CONFLICT);
    }
    if (verify(userId, code).isEmpty()) {
      throw new ApiException(ErrorCode.INVALID_MFA_CODE);
    }
    jdbc.sql("DELETE FROM mfa_recovery_codes WHERE user_id = ?").param(userId).update();
    jdbc.sql("DELETE FROM user_mfa WHERE user_id = ?").param(userId).update();
    activity.record(userId, ActivityType.MFA_DISABLED);
  }

  /**
   * Checks a sign-in code: a 6-digit code from the app, or an unused recovery code. An accepted app
   * code cannot be used again, and a recovery code is spent.
   */
  @Transactional
  public Optional<Factor> verify(UUID userId, String code) {
    codeAttempts.consume(userId.toString());
    Row row = row(userId).filter(r -> r.enabledAt() != null).orElse(null);
    if (row == null || code == null) {
      return Optional.empty();
    }
    String normalized = normalize(code);
    if (normalized.matches("\\d{6}")) {
      byte[] secret = cipher.open(userId, row.ciphertext(), row.nonce());
      OptionalLong step;
      try {
        step = Totp.match(secret, normalized, clock.instant(), row.lastUsedStep());
      } finally {
        Arrays.fill(secret, (byte) 0);
      }
      if (step.isEmpty()) {
        return Optional.empty();
      }
      // Conditional, so two requests racing with the same code cannot both pass.
      int updated =
          jdbc.sql(
                  "UPDATE user_mfa SET last_used_step = ? WHERE user_id = ?"
                      + " AND (last_used_step IS NULL OR last_used_step < ?)")
              .params(step.getAsLong(), userId, step.getAsLong())
              .update();
      return updated == 1 ? Optional.of(Factor.AUTHENTICATOR) : Optional.empty();
    }
    if (normalized.length() == RECOVERY_CODE_LENGTH) {
      int spent =
          jdbc.sql(
                  "UPDATE mfa_recovery_codes SET used_at = ?"
                      + " WHERE user_id = ? AND code_hash = ? AND used_at IS NULL")
              .params(Db.ts(clock.instant()), userId, sha256(normalized))
              .update();
      if (spent == 1) {
        activity.record(userId, ActivityType.MFA_RECOVERY_CODE_USED);
        return Optional.of(Factor.RECOVERY_CODE);
      }
    }
    return Optional.empty();
  }

  /** Issues a fresh set of recovery codes; the old ones stop working. Needs the password. */
  @Transactional
  public List<String> regenerateRecoveryCodes(UUID userId, String accountPassword) {
    stepUp.verify(userId, accountPassword);
    if (!isEnabled(userId)) {
      throw new ApiException(ErrorCode.MFA_STATE_CONFLICT);
    }
    return replaceRecoveryCodes(userId);
  }

  private List<String> replaceRecoveryCodes(UUID userId) {
    jdbc.sql("DELETE FROM mfa_recovery_codes WHERE user_id = ?").param(userId).update();
    Instant now = clock.instant();
    List<String> codes = new ArrayList<>(RECOVERY_CODES);
    for (int i = 0; i < RECOVERY_CODES; i++) {
      String code = randomRecoveryCode();
      jdbc.sql(
              "INSERT INTO mfa_recovery_codes (id, user_id, code_hash, created_at)"
                  + " VALUES (?, ?, ?, ?)")
          .params(UUID.randomUUID(), userId, sha256(code), Db.ts(now))
          .update();
      codes.add(code.substring(0, 4) + "-" + code.substring(4, 8) + "-" + code.substring(8));
    }
    return codes;
  }

  private String randomRecoveryCode() {
    StringBuilder sb = new StringBuilder(RECOVERY_CODE_LENGTH);
    for (int i = 0; i < RECOVERY_CODE_LENGTH; i++) {
      sb.append(RECOVERY_ALPHABET.charAt(random.nextInt(RECOVERY_ALPHABET.length())));
    }
    return sb.toString();
  }

  private Optional<Row> row(UUID userId) {
    return jdbc.sql(
            "SELECT secret_ciphertext, secret_nonce, enabled_at, last_used_step"
                + " FROM user_mfa WHERE user_id = ?")
        .param(userId)
        .query((rs, n) ->
            new Row(
                rs.getBytes("secret_ciphertext"),
                rs.getBytes("secret_nonce"),
                Db.instant(rs, "enabled_at"),
                rs.getObject("last_used_step", Long.class)))
        .optional();
  }

  /** Spaces and dashes are ignored and letters are case-insensitive, as people type them. */
  private static String normalize(String code) {
    return code == null ? "" : code.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
  }

  private static byte[] sha256(String value) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static String otpauthUri(String email, String base32) {
    String label =
        URLEncoder.encode("SecureVault:" + email, StandardCharsets.UTF_8).replace("+", "%20");
    return "otpauth://totp/"
        + label
        + "?secret="
        + base32
        + "&issuer=SecureVault&algorithm=SHA1&digits="
        + Totp.DIGITS
        + "&period="
        + Totp.STEP.toSeconds();
  }
}
