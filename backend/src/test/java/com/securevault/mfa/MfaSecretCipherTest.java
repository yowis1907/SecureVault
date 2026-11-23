package com.securevault.mfa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class MfaSecretCipherTest {

  /** The local-development value from .env.example, which production must refuse. */
  private static final String EXAMPLE_KEY =
      "SJyWsaORt44YzvGk/jtVWDv1ff7PxRxEGZZ6b6DQpxM="; // gitleaks:allow

  private static MockEnvironment env(String... profiles) {
    MockEnvironment env = new MockEnvironment();
    env.setActiveProfiles(profiles);
    return env;
  }

  private static String randomKey() {
    byte[] key = new byte[32];
    new SecureRandom().nextBytes(key);
    return Base64.getEncoder().encodeToString(key);
  }

  @Test
  void roundTripsAndBindsTheCiphertextToTheUser() {
    MfaSecretCipher cipher = new MfaSecretCipher(randomKey(), env());
    UUID alice = UUID.randomUUID();
    byte[] secret = new byte[20];
    new SecureRandom().nextBytes(secret);
    MfaSecretCipher.Sealed sealed = cipher.seal(alice, secret);
    assertThat(sealed.ciphertext()).hasSize(36);
    assertThat(cipher.open(alice, sealed.ciphertext(), sealed.nonce())).isEqualTo(secret);
    assertThatThrownBy(() -> cipher.open(UUID.randomUUID(), sealed.ciphertext(), sealed.nonce()))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void productionRefusesAMissingKey() {
    assertThatThrownBy(() -> new MfaSecretCipher("", env("prod")))
        .hasMessageContaining("SECUREVAULT_MFA_KEY must be set");
  }

  @Test
  void productionRefusesTheExampleKey() {
    assertThatThrownBy(() -> new MfaSecretCipher(EXAMPLE_KEY, env("prod")))
        .hasMessageContaining("example key");
    // Outside production the example key is fine; that is what it is for.
    new MfaSecretCipher(EXAMPLE_KEY, env());
  }

  @Test
  void rejectsAKeyOfTheWrongLength() {
    assertThatThrownBy(
            () -> new MfaSecretCipher(Base64.getEncoder().encodeToString(new byte[16]), env()))
        .hasMessageContaining("32 bytes");
  }

  @Test
  void matchesTheRfc6238Vector() {
    // RFC 6238 appendix B, SHA-1, T = 59 s: 94287082, whose last six digits are 287082.
    byte[] secret = "12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    assertThat(Totp.code(secret, Totp.step(java.time.Instant.ofEpochSecond(59))))
        .isEqualTo("287082");
  }
}
