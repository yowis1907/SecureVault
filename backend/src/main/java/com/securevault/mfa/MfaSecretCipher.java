package com.securevault.mfa;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Encrypts TOTP secrets at rest with AES-256-GCM (JDK provider) under a key from the environment,
 * {@code SECUREVAULT_MFA_KEY}: 32 random bytes, base64. The key never touches the database, so a
 * stolen database alone cannot produce codes. The user's ID is the associated data, so a ciphertext
 * copied to another account fails to decrypt.
 *
 * <p>Without a key outside production, a random one is made at startup and secrets do not survive a
 * restart. The {@code prod} profile refuses to start without a key, or with the example key from
 * {@code .env.example}.
 */
@Component
class MfaSecretCipher {

  private static final Logger log = LoggerFactory.getLogger(MfaSecretCipher.class);
  private static final int NONCE_BYTES = 12;
  private static final int TAG_BITS = 128;

  /** SHA-256 of the local-development key in .env.example, which production must not use. */
  private static final String EXAMPLE_KEY_SHA256 =
      "94667bf6e3cfaedf165d20dd9178d6e8fcb3ab00d5e1c04e200593cb5a3da16a";

  record Sealed(byte[] ciphertext, byte[] nonce) {}

  private final SecretKeySpec key;
  private final SecureRandom random = new SecureRandom();

  MfaSecretCipher(@Value("${securevault.mfa.key:}") String base64Key, Environment environment) {
    boolean production = environment.acceptsProfiles(Profiles.of("prod"));
    byte[] raw;
    if (base64Key == null || base64Key.isBlank()) {
      if (production) {
        throw new IllegalStateException(
            "Unsafe production configuration: SECUREVAULT_MFA_KEY must be set");
      }
      raw = new byte[32];
      random.nextBytes(raw);
      log.warn(
          "SECUREVAULT_MFA_KEY is not set. Using a temporary key: two-factor secrets will not"
              + " survive a restart.");
    } else {
      try {
        raw = Base64.getDecoder().decode(base64Key.strip());
      } catch (IllegalArgumentException e) {
        throw new IllegalStateException("SECUREVAULT_MFA_KEY must be base64", e);
      }
      if (raw.length != 32) {
        throw new IllegalStateException("SECUREVAULT_MFA_KEY must decode to 32 bytes");
      }
      if (production && EXAMPLE_KEY_SHA256.equals(sha256Hex(raw))) {
        throw new IllegalStateException(
            "Unsafe production configuration: SECUREVAULT_MFA_KEY is the example key");
      }
    }
    this.key = new SecretKeySpec(raw, "AES");
    Arrays.fill(raw, (byte) 0);
  }

  Sealed seal(UUID userId, byte[] secret) {
    byte[] nonce = new byte[NONCE_BYTES];
    random.nextBytes(nonce);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
      cipher.updateAAD(aad(userId));
      return new Sealed(cipher.doFinal(secret), nonce);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("Could not encrypt the two-factor secret", e);
    }
  }

  byte[] open(UUID userId, byte[] ciphertext, byte[] nonce) {
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
      cipher.updateAAD(aad(userId));
      return cipher.doFinal(ciphertext);
    } catch (GeneralSecurityException e) {
      // Wrong key (for example after a restart without a configured key) or altered data.
      throw new IllegalStateException("Could not decrypt the two-factor secret", e);
    }
  }

  private static byte[] aad(UUID userId) {
    return ByteBuffer.allocate(26)
        .put("sv-mfa".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, 6)
        .putLong(userId.getMostSignificantBits())
        .putLong(userId.getLeastSignificantBits())
        .putInt(1)
        .array();
  }

  private static String sha256Hex(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(e);
    }
  }
}
