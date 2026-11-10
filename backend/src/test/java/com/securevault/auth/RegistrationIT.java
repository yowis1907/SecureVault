package com.securevault.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Registration, email verification, resend, and account password reset, end to end. */
class RegistrationIT extends ApiTestBase {

  private Response register(
      ApiClient client, String email, String password, Map<String, Object> vault) {
    return client.post("/api/v1/auth/register", registration(email, password, vault));
  }

  // --- Registration and verification ---

  @Test
  void registrationCreatesAnUnverifiedAccountAndEmailsALinkWithTheTokenInTheFragment()
      throws Exception {
    String email = newEmail();
    String password = newPassword();
    Map<String, Object> vault = vaultMaterial();
    ApiClient client = client().fetchCsrf();

    Response response = register(client, email, password, vault);

    assertThat(response.status()).isEqualTo(202);
    assertThat(response.body()).isEmpty();
    List<com.securevault.testsupport.RecordingMailer.Message> sent = mailer.to(email);
    assertThat(sent).hasSize(1);
    assertThat(sent.getFirst().body())
        .contains("http://localhost:3000/verify-email#token=")
        .doesNotContain("?token");

    Response login = client.login(email, password);
    assertThat(login.status()).isEqualTo(403);
    assertThat(login.code()).isEqualTo("EMAIL_NOT_VERIFIED");

    byte[] storedWrappedKey =
        jdbc.queryForObject(
            "SELECT v.wrapped_dek FROM vaults v JOIN users u ON u.id = v.user_id WHERE u.email = ?",
            byte[].class,
            email);
    assertThat(Base64.getEncoder().encodeToString(storedWrappedKey))
        .isEqualTo(vault.get("wrappedDek"));
  }

  @Test
  void aVerificationLinkWorksOnceAndUnknownTokensFail() {
    String email = newEmail();
    String password = newPassword();
    ApiClient client = client().fetchCsrf();
    register(client, email, password, vaultMaterial());
    String token = mailer.latestToken(email);

    assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", token)).status())
        .isEqualTo(204);
    Response reused = client.post("/api/v1/auth/verify-email", Map.of("token", token));
    assertThat(reused.status()).isEqualTo(400);
    assertThat(reused.code()).isEqualTo("INVALID_TOKEN");
    for (String bad : List.of("not-a-token", base64(randomBytes(32)), "A".repeat(43))) {
      assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", bad)).code())
          .isEqualTo("INVALID_TOKEN");
    }
    assertThat(client.login(email, password).status()).isEqualTo(200);
  }

  @Test
  void onlyAHashOfTheTokenIsStored() throws Exception {
    String email = newEmail();
    register(client().fetchCsrf(), email, newPassword(), vaultMaterial());
    byte[] raw = Base64.getUrlDecoder().decode(mailer.latestToken(email));

    List<byte[]> stored =
        jdbc.queryForList(
            "SELECT t.token_hash FROM one_time_tokens t JOIN users u ON u.id = t.user_id"
                + " WHERE u.email = ?",
            byte[].class,
            email);

    assertThat(stored).hasSize(1);
    assertThat(stored.getFirst()).isEqualTo(MessageDigest.getInstance("SHA-256").digest(raw));
    assertThat(stored.getFirst()).isNotEqualTo(raw);
  }

  @Test
  void aVerificationLinkExpiresAfter24Hours() {
    String email = newEmail();
    ApiClient client = client().fetchCsrf();
    register(client, email, newPassword(), vaultMaterial());
    String token = mailer.latestToken(email);

    clock.advance(Duration.ofHours(24).plusMinutes(1));

    assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", token)).code())
        .isEqualTo("INVALID_TOKEN");
  }

  @Test
  void registeringATakenEmailLooksTheSameAndChangesNothing() {
    Account existing = signedInAccount();
    int emailsBefore = mailer.to(existing.email()).size();
    ApiClient other = client().fetchCsrf();

    Response response = register(other, existing.email(), newPassword(), vaultMaterial());

    assertThat(response.status()).isEqualTo(202);
    assertThat(response.body()).isEmpty();
    assertThat(mailer.to(existing.email())).hasSize(emailsBefore + 1);
    assertThat(mailer.to(existing.email()).getLast().subject()).contains("sign-up attempt");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE email = ?", Long.class, existing.email()))
        .isEqualTo(1);
    assertThat(existing.client().get("/api/v1/vault").<String>json("$.wrappedDek"))
        .isEqualTo(existing.vault().get("wrappedDek"));
    assertThat(signIn(existing).get("/api/v1/auth/me").status()).isEqualTo(200);
  }

  @Test
  void repeatedSignUpsWithSomeoneElsesAddressCannotFloodTheirInbox() {
    Account victim = signedInAccount();
    int before = mailer.to(victim.email()).size();
    for (int i = 0; i < 5; i++) {
      // A fresh client each time, as from many different IPs.
      assertThat(
              register(client().fetchCsrf(), victim.email(), newPassword(), vaultMaterial())
                  .status())
          .isEqualTo(202);
    }
    assertThat(mailer.to(victim.email())).hasSize(before + 3);
  }

  @Test
  void emailIsNormalizedSoCaseVariantsAreTheSameAccount() {
    Account existing = signedInAccount();
    ApiClient other = client().fetchCsrf();
    register(other, "  " + existing.email().toUpperCase() + " ", newPassword(), vaultMaterial());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE lower(email) = ?", Long.class, existing.email()))
        .isEqualTo(1);
  }

  @Test
  void invalidRegistrationsAreRejectedBeforeAnythingIsStored() {
    ApiClient client = client().fetchCsrf();
    String email = newEmail();
    long usersBefore = jdbc.queryForObject("SELECT count(*) FROM users", Long.class);

    List<Map<String, Object>> invalid =
        List.of(
            registration(email, "short-11ch", vaultMaterial()),
            registration("not-an-email", newPassword(), vaultMaterial()),
            registration(email, newPassword(), withKdf("memoryKib", 8192)),
            registration(email, newPassword(), withKdf("iterations", 2)),
            registration(email, newPassword(), withKdf("salt", base64(randomBytes(15)))),
            registration(email, newPassword(), withKdf("algorithm", "ARGON2I")),
            registration(email, newPassword(), with("cryptoVersion", 2)),
            registration(email, newPassword(), with("wrappedDek", base64(randomBytes(47)))),
            registration(email, newPassword(), with("wrapNonce", base64(randomBytes(16)))));
    for (Map<String, Object> body : invalid) {
      Response response = client.post("/api/v1/auth/register", body);
      assertThat(response.status()).as(body.toString()).isEqualTo(400);
      assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
    }

    Map<String, Object> withMasterPassword =
        new HashMap<>(registration(email, newPassword(), vaultMaterial()));
    withMasterPassword.put("masterPassword", "must-never-be-accepted");
    assertThat(client.post("/api/v1/auth/register", withMasterPassword).code())
        .isEqualTo("VALIDATION_FAILED");

    assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class))
        .isEqualTo(usersBefore);
    assertThat(mailer.to(email)).isEmpty();
  }

  @Test
  void registrationIsLimitedPerIp() {
    ApiClient client = client().fetchCsrf();
    for (int i = 0; i < 5; i++) {
      assertThat(register(client, newEmail(), newPassword(), vaultMaterial()).status())
          .isEqualTo(202);
    }
    Response limited = register(client, newEmail(), newPassword(), vaultMaterial());
    assertThat(limited.status()).isEqualTo(429);
    assertThat(limited.header("Retry-After")).isNotBlank();
  }

  // --- Resend ---

  @Test
  void resendSendsAFreshLinkAndCancelsTheOldOne() {
    String email = newEmail();
    ApiClient client = client().fetchCsrf();
    register(client, email, newPassword(), vaultMaterial());
    String first = mailer.latestToken(email);

    assertThat(client.post("/api/v1/auth/verification/resend", Map.of("email", email)).status())
        .isEqualTo(202);
    String second = mailer.latestToken(email);

    assertThat(second).isNotEqualTo(first);
    assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", first)).code())
        .isEqualTo("INVALID_TOKEN");
    assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", second)).status())
        .isEqualTo(204);
  }

  @Test
  void resendForUnknownOrVerifiedAddressesAnswersTheSameAndSendsNothing() {
    Account verified = signedInAccount();
    String unknown = newEmail();
    int before = mailer.to(verified.email()).size();
    ApiClient client = client().fetchCsrf();

    for (String email : List.of(unknown, verified.email())) {
      Response response = client.post("/api/v1/auth/verification/resend", Map.of("email", email));
      assertThat(response.status()).isEqualTo(202);
      assertThat(response.body()).isEmpty();
    }
    assertThat(mailer.to(unknown)).isEmpty();
    assertThat(mailer.to(verified.email())).hasSize(before);
  }

  // --- Account password reset ---

  @Test
  void passwordResetChangesOnlyTheAccountPasswordAndEndsEverySession() {
    Account account = signedInAccount();
    ApiClient secondSession = signIn(account);
    String wrappedKeyBefore = account.client().get("/api/v1/vault").json("$.wrappedDek");
    ApiClient anonymous = client().fetchCsrf();

    assertThat(
            anonymous
                .post("/api/v1/auth/password/forgot", Map.of("email", account.email()))
                .status())
        .isEqualTo(202);
    assertThat(mailer.to(account.email()).getLast().body())
        .contains("http://localhost:3000/reset-password#token=");
    String token = mailer.latestToken(account.email());
    String newPassword = newPassword();

    Response reset =
        anonymous.post(
            "/api/v1/auth/password/reset",
            Map.of("token", token, "newAccountPassword", newPassword));

    assertThat(reset.status()).isEqualTo(204);
    assertThat(account.client().get("/api/v1/auth/me").status()).isEqualTo(401);
    assertThat(secondSession.get("/api/v1/auth/me").status()).isEqualTo(401);
    assertThat(client().fetchCsrf().login(account.email(), account.password()).code())
        .isEqualTo("INVALID_CREDENTIALS");
    ApiClient fresh = client().fetchCsrf();
    assertThat(fresh.login(account.email(), newPassword).status()).isEqualTo(200);
    assertThat(fresh.get("/api/v1/vault").<String>json("$.wrappedDek")).isEqualTo(wrappedKeyBefore);
    assertThat(mailer.to(account.email()).getLast().subject()).contains("was changed");

    Response reused =
        anonymous.post(
            "/api/v1/auth/password/reset",
            Map.of("token", token, "newAccountPassword", newPassword()));
    assertThat(reused.code()).isEqualTo("INVALID_TOKEN");
  }

  @Test
  void aResetLinkExpiresAfter30Minutes() {
    Account account = signedInAccount();
    ApiClient client = client().fetchCsrf();
    client.post("/api/v1/auth/password/forgot", Map.of("email", account.email()));
    String token = mailer.latestToken(account.email());

    clock.advance(Duration.ofMinutes(31));

    Response response =
        client.post(
            "/api/v1/auth/password/reset",
            Map.of("token", token, "newAccountPassword", newPassword()));
    assertThat(response.code()).isEqualTo("INVALID_TOKEN");
    assertThat(signIn(account).get("/api/v1/auth/me").status()).isEqualTo(200);
  }

  @Test
  void aResetNeedsAPasswordOfAtLeast12Characters() {
    Account account = signedInAccount();
    ApiClient client = client().fetchCsrf();
    client.post("/api/v1/auth/password/forgot", Map.of("email", account.email()));
    Response response =
        client.post(
            "/api/v1/auth/password/reset",
            Map.of(
                "token", mailer.latestToken(account.email()), "newAccountPassword", "short-11ch"));
    assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  void forgotPasswordForUnknownOrUnverifiedAddressesSendsNothing() {
    String unknown = newEmail();
    String unverified = newEmail();
    ApiClient client = client().fetchCsrf();
    register(client, unverified, newPassword(), vaultMaterial());
    int before = mailer.to(unverified).size();

    for (String email : List.of(unknown, unverified)) {
      Response response = client.post("/api/v1/auth/password/forgot", Map.of("email", email));
      assertThat(response.status()).isEqualTo(202);
      assertThat(response.body()).isEmpty();
    }
    assertThat(mailer.to(unknown)).isEmpty();
    assertThat(mailer.to(unverified)).hasSize(before);
  }

  @Test
  void theLimitPerAddressIsSilentSoItCannotConfirmAnAccount() {
    Account account = signedInAccount();
    int before = mailer.to(account.email()).size();
    for (int i = 0; i < 4; i++) {
      ApiClient client = client().fetchCsrf();
      assertThat(
              client
                  .post("/api/v1/auth/password/forgot", Map.of("email", account.email()))
                  .status())
          .isEqualTo(202);
    }
    assertThat(mailer.to(account.email())).hasSize(before + 3);
  }

  @Test
  void emailRequestsAreLimitedPerIp() {
    ApiClient client = client().fetchCsrf();
    for (int i = 0; i < 10; i++) {
      assertThat(client.post("/api/v1/auth/password/forgot", Map.of("email", newEmail())).status())
          .isEqualTo(202);
    }
    assertThat(client.post("/api/v1/auth/password/forgot", Map.of("email", newEmail())).code())
        .isEqualTo("RATE_LIMITED");
  }

  @Test
  void tokenSubmissionsAreLimitedPerIp() {
    ApiClient client = client().fetchCsrf();
    for (int i = 0; i < 10; i++) {
      assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", "guess-" + i)).code())
          .isEqualTo("INVALID_TOKEN");
    }
    assertThat(client.post("/api/v1/auth/verify-email", Map.of("token", "guess")).code())
        .isEqualTo("RATE_LIMITED");
  }

  private static Map<String, Object> with(String key, Object value) {
    Map<String, Object> vault = new HashMap<>(vaultMaterial());
    vault.put(key, value);
    return vault;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> withKdf(String key, Object value) {
    Map<String, Object> vault = new HashMap<>(vaultMaterial());
    Map<String, Object> kdf = new HashMap<>((Map<String, Object>) vault.get("kdf"));
    kdf.put(key, value);
    vault.put("kdf", kdf);
    return vault;
  }
}
