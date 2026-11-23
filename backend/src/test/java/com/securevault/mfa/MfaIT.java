package com.securevault.mfa;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiTestBase;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.bouncycastle.util.encoders.Base32;
import org.junit.jupiter.api.Test;

/** Two-factor sign-in end to end through the API. All secrets and codes are test values. */
class MfaIT extends ApiTestBase {

  private record Enabled(Account account, byte[] secret, List<String> recoveryCodes) {}

  private String codeNow(byte[] secret) {
    return Totp.code(secret, Totp.step(clock.instant()));
  }

  /** Moves to the next 30-second step, so a fresh code is not a replay of the last one. */
  private void nextStep() {
    clock.advance(Duration.ofSeconds(30));
  }

  private Enabled enableMfa() {
    Account account = signedInAccount();
    ApiClient.Response setup =
        account
            .client()
            .post("/api/v1/account/mfa/setup", Map.of("accountPassword", account.password()));
    assertThat(setup.status()).isEqualTo(200);
    String base32 = setup.json("$.secret");
    assertThat((String) setup.json("$.otpauthUri"))
        .startsWith("otpauth://totp/SecureVault%3A")
        .contains("secret=" + base32)
        .contains("issuer=SecureVault");
    byte[] secret = Base32.decode(base32);
    assertThat(secret).hasSize(20);

    ApiClient.Response enable =
        account.client().post("/api/v1/account/mfa/enable", Map.of("code", codeNow(secret)));
    assertThat(enable.status()).isEqualTo(200);
    List<String> codes = enable.json("$.recoveryCodes");
    assertThat(codes).hasSize(10).allMatch(c -> c.matches("[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}"));
    nextStep();
    return new Enabled(account, secret, codes);
  }

  private ApiClient passwordStep(Account account) {
    ApiClient client = client().fetchCsrf();
    ApiClient.Response login = client.login(account.email(), account.password());
    assertThat(login.status()).isEqualTo(200);
    assertThat((Boolean) login.json("$.mfaRequired")).isTrue();
    return client;
  }

  @Test
  void setupNeedsTheAccountPassword() {
    Account account = signedInAccount();
    ApiClient.Response response =
        account
            .client()
            .post("/api/v1/account/mfa/setup", Map.of("accountPassword", "wrong-" + newPassword()));
    assertThat(response.status()).isEqualTo(403);
    assertThat(response.code()).isEqualTo("STEP_UP_FAILED");
  }

  @Test
  void enablingNeedsAValidCodeAndReportsStatus() {
    Account account = signedInAccount();
    assertThat((Boolean) account.client().get("/api/v1/account/mfa").json("$.enabled")).isFalse();
    assertThat(account.client().post("/api/v1/account/mfa/enable", Map.of("code", "123456")).code())
        .isEqualTo("MFA_STATE_CONFLICT");

    account
        .client()
        .post("/api/v1/account/mfa/setup", Map.of("accountPassword", account.password()));
    ApiClient.Response wrong =
        account.client().post("/api/v1/account/mfa/enable", Map.of("code", "000000"));
    assertThat(wrong.status()).isEqualTo(401);
    assertThat(wrong.code()).isEqualTo("INVALID_MFA_CODE");
    assertThat((Boolean) account.client().get("/api/v1/account/mfa").json("$.enabled")).isFalse();
  }

  @Test
  void signInNeedsACodeAfterThePassword() {
    Enabled e = enableMfa();
    ApiClient.Response status = e.account().client().get("/api/v1/account/mfa");
    assertThat((Boolean) status.json("$.enabled")).isTrue();
    assertThat((Integer) status.json("$.recoveryCodesRemaining")).isEqualTo(10);

    ApiClient client = passwordStep(e.account());
    // The password alone is not a session.
    assertThat(client.get("/api/v1/auth/me").status()).isEqualTo(401);

    ApiClient.Response wrong = client.post("/api/v1/auth/login/mfa", Map.of("code", "000000"));
    assertThat(wrong.status()).isEqualTo(401);
    assertThat(wrong.code()).isEqualTo("INVALID_MFA_CODE");

    ApiClient.Response right =
        client.post("/api/v1/auth/login/mfa", Map.of("code", codeNow(e.secret())));
    assertThat(right.status()).isEqualTo(200);
    assertThat((String) right.json("$.email")).isEqualTo(e.account().email());
    assertThat(client.get("/api/v1/auth/me").status()).isEqualTo(200);
  }

  @Test
  void anAcceptedCodeCannotBeUsedAgain() {
    Enabled e = enableMfa();
    String code = codeNow(e.secret());
    ApiClient first = passwordStep(e.account());
    assertThat(first.post("/api/v1/auth/login/mfa", Map.of("code", code)).status()).isEqualTo(200);

    ApiClient second = passwordStep(e.account());
    ApiClient.Response replay = second.post("/api/v1/auth/login/mfa", Map.of("code", code));
    assertThat(replay.status()).isEqualTo(401);
    assertThat(replay.code()).isEqualTo("INVALID_MFA_CODE");
  }

  @Test
  void aRecoveryCodeWorksOnce() {
    Enabled e = enableMfa();
    String recovery = e.recoveryCodes().getFirst();
    ApiClient first = passwordStep(e.account());
    // Typed the way people type: lower case, no dashes.
    assertThat(
            first
                .post(
                    "/api/v1/auth/login/mfa",
                    Map.of("code", recovery.replace("-", "").toLowerCase()))
                .status())
        .isEqualTo(200);
    assertThat(
            (Integer) first.fetchCsrf().get("/api/v1/account/mfa").json("$.recoveryCodesRemaining"))
        .isEqualTo(9);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_events WHERE user_id = ? AND event_type = ?",
                Integer.class,
                e.account().id(),
                "MFA_RECOVERY_CODE_USED"))
        .isEqualTo(1);

    ApiClient second = passwordStep(e.account());
    assertThat(second.post("/api/v1/auth/login/mfa", Map.of("code", recovery)).status())
        .isEqualTo(401);
  }

  @Test
  void theCodeStepExpires() {
    Enabled e = enableMfa();
    ApiClient client = passwordStep(e.account());
    clock.advance(Duration.ofMinutes(6));
    ApiClient.Response late =
        client.post("/api/v1/auth/login/mfa", Map.of("code", codeNow(e.secret())));
    assertThat(late.status()).isEqualTo(401);
    assertThat(late.code()).isEqualTo("MFA_CHALLENGE_EXPIRED");
  }

  @Test
  void tooManyWrongCodesMeanThePasswordAgain() {
    Enabled e = enableMfa();
    ApiClient client = passwordStep(e.account());
    for (int i = 0; i < 5; i++) {
      assertThat(client.post("/api/v1/auth/login/mfa", Map.of("code", "000000")).code())
          .isEqualTo("INVALID_MFA_CODE");
    }
    ApiClient.Response after =
        client.post("/api/v1/auth/login/mfa", Map.of("code", codeNow(e.secret())));
    assertThat(after.code()).isEqualTo("MFA_CHALLENGE_EXPIRED");
  }

  @Test
  void aCodeWithoutAPasswordStepIsRefused() {
    ApiClient client = client().fetchCsrf();
    ApiClient.Response response = client.post("/api/v1/auth/login/mfa", Map.of("code", "123456"));
    assertThat(response.status()).isEqualTo(401);
    assertThat(response.code()).isEqualTo("MFA_CHALLENGE_EXPIRED");
  }

  @Test
  void disablingNeedsThePasswordAndACode() {
    Enabled e = enableMfa();
    ApiClient client = e.account().client();
    assertThat(
            client
                .post(
                    "/api/v1/account/mfa/disable",
                    Map.of("accountPassword", e.account().password(), "code", "000000"))
                .code())
        .isEqualTo("INVALID_MFA_CODE");
    assertThat(
            client
                .post(
                    "/api/v1/account/mfa/disable",
                    Map.of(
                        "accountPassword", "wrong-" + newPassword(), "code", codeNow(e.secret())))
                .code())
        .isEqualTo("STEP_UP_FAILED");
    assertThat(
            client
                .post(
                    "/api/v1/account/mfa/disable",
                    Map.of("accountPassword", e.account().password(), "code", codeNow(e.secret())))
                .status())
        .isEqualTo(204);

    // Password alone signs in again, and nothing of the secret is left behind.
    ApiClient fresh = client().fetchCsrf();
    ApiClient.Response login = fresh.login(e.account().email(), e.account().password());
    assertThat((String) login.json("$.email")).isEqualTo(e.account().email());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM user_mfa WHERE user_id = ?", Integer.class, e.account().id()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM mfa_recovery_codes WHERE user_id = ?",
                Integer.class,
                e.account().id()))
        .isZero();
  }

  @Test
  void theSecretIsStoredEncryptedAndCodesOnlyAsHashes() {
    Enabled e = enableMfa();
    byte[] stored =
        jdbc.queryForObject(
            "SELECT secret_ciphertext FROM user_mfa WHERE user_id = ?",
            byte[].class,
            e.account().id());
    assertThat(stored).hasSize(36);
    assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1))
        .doesNotContain(new String(e.secret(), java.nio.charset.StandardCharsets.ISO_8859_1));
    List<byte[]> hashes =
        jdbc.queryForList(
            "SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ?",
            byte[].class,
            e.account().id());
    assertThat(hashes).hasSize(10).allMatch(h -> h.length == 32);
    String rows =
        jdbc.queryForList(
                "SELECT encode(code_hash, 'escape') FROM mfa_recovery_codes", String.class)
            .toString();
    for (String code : e.recoveryCodes()) {
      assertThat(rows).doesNotContain(code.replace("-", ""));
    }
  }

  @Test
  void recoveryCodesCanBeReplaced() {
    Enabled e = enableMfa();
    ApiClient.Response response =
        e.account()
            .client()
            .post(
                "/api/v1/account/mfa/recovery-codes",
                Map.of("accountPassword", e.account().password()));
    List<String> fresh = response.json("$.recoveryCodes");
    assertThat(fresh).hasSize(10).doesNotContainAnyElementsOf(e.recoveryCodes());
    ApiClient client = passwordStep(e.account());
    assertThat(
            client
                .post("/api/v1/auth/login/mfa", Map.of("code", e.recoveryCodes().getFirst()))
                .status())
        .isEqualTo(401);
  }
}
