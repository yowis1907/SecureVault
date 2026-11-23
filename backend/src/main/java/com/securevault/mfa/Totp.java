package com.securevault.mfa;

import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.OptionalLong;
import javax.crypto.spec.SecretKeySpec;

/**
 * RFC 6238 codes as authenticator apps make them: HMAC-SHA1, 6 digits, 30-second steps. SHA-1 is
 * used only inside HMAC, where it remains sound, and it is the one algorithm every authenticator
 * app supports. The code generation itself comes from the java-otp library.
 */
final class Totp {

  static final Duration STEP = Duration.ofSeconds(30);
  static final int DIGITS = 6;
  static final String ALGORITHM = "HmacSHA1";

  /** One step either side, to allow for clock drift between the phone and the server. */
  private static final int WINDOW = 1;

  private static final TimeBasedOneTimePasswordGenerator GENERATOR = generator();

  private static TimeBasedOneTimePasswordGenerator generator() {
    try {
      return new TimeBasedOneTimePasswordGenerator(STEP, DIGITS, ALGORITHM);
    } catch (java.security.NoSuchAlgorithmException e) {
      // Every Java platform is required to provide HmacSHA1.
      throw new IllegalStateException(e);
    }
  }

  private Totp() {}

  static long step(Instant instant) {
    return Math.floorDiv(instant.getEpochSecond(), STEP.toSeconds());
  }

  static String code(byte[] secret, long step) {
    try {
      return GENERATOR.generateOneTimePasswordString(
          new SecretKeySpec(secret, ALGORITHM), Instant.ofEpochSecond(step * STEP.toSeconds()));
    } catch (InvalidKeyException e) {
      throw new IllegalStateException(e);
    }
  }

  /**
   * The step whose code matches, if any, among the current step and one either side, skipping any
   * step at or before {@code lastUsedStep} so an accepted code cannot be replayed.
   */
  static OptionalLong match(byte[] secret, String code, Instant now, Long lastUsedStep) {
    long current = step(now);
    byte[] given = code.getBytes(StandardCharsets.US_ASCII);
    for (long s = current - WINDOW; s <= current + WINDOW; s++) {
      if (lastUsedStep != null && s <= lastUsedStep) {
        continue;
      }
      // Constant-time comparison, so response time does not leak how many digits were right.
      if (MessageDigest.isEqual(given, code(secret, s).getBytes(StandardCharsets.US_ASCII))) {
        return OptionalLong.of(s);
      }
    }
    return OptionalLong.empty();
  }
}
