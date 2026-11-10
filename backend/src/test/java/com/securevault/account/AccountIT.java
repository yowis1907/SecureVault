package com.securevault.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountIT extends ApiTestBase {

  @Test
  void changingThePasswordKeepsThisSessionOnNewIdAndEndsTheOthers() {
    Account account = signedInAccount();
    ApiClient other = signIn(account);
    String oldSessionId = account.client().sessionId();
    String newPassword = newPassword();

    Response response =
        account
            .client()
            .put(
                "/api/v1/account/password",
                Map.of(
                    "currentAccountPassword",
                    account.password(),
                    "newAccountPassword",
                    newPassword));

    assertThat(response.status()).isEqualTo(204);
    assertThat(account.client().sessionId()).isNotEqualTo(oldSessionId);
    assertThat(account.client().get("/api/v1/auth/me").status()).isEqualTo(200);
    assertThat(other.get("/api/v1/auth/me").status()).isEqualTo(401);
    assertThat(client().fetchCsrf().login(account.email(), account.password()).status())
        .isEqualTo(401);
    assertThat(client().fetchCsrf().login(account.email(), newPassword).status()).isEqualTo(200);
  }

  @Test
  void changingThePasswordNeedsTheCurrentOneAndAValidNewOne() {
    Account account = signedInAccount();
    Response wrong =
        account
            .client()
            .put(
                "/api/v1/account/password",
                Map.of(
                    "currentAccountPassword",
                    "wrong-" + account.password(),
                    "newAccountPassword",
                    newPassword()));
    assertThat(wrong.status()).isEqualTo(403);
    assertThat(wrong.code()).isEqualTo("STEP_UP_FAILED");

    Response tooShort =
        account
            .client()
            .put(
                "/api/v1/account/password",
                Map.of(
                    "currentAccountPassword",
                    account.password(),
                    "newAccountPassword",
                    "short-11ch"));
    assertThat(tooShort.code()).isEqualTo("VALIDATION_FAILED");
    assertThat(signIn(account).get("/api/v1/auth/me").status()).isEqualTo(200);
  }

  @Test
  void sessionsAreListedByHandleAndCanBeRevoked() {
    Account account = signedInAccount();
    ApiClient second = signIn(account);
    ApiClient third = signIn(account);

    Response list = account.client().get("/api/v1/account/sessions");
    List<String> handles = list.json("$.sessions[*].handle");
    List<Boolean> current = list.json("$.sessions[*].current");
    assertThat(handles).hasSize(3).allMatch(h -> h.matches("[0-9a-f]{32}"));
    assertThat(current).containsOnlyOnce(true);
    assertThat(list.body())
        .doesNotContain(account.client().sessionId(), second.sessionId(), account.client().session);

    String secondHandle =
        second
            .get("/api/v1/account/sessions")
            .<List<String>>json("$.sessions[?(@.current == true)].handle")
            .getFirst();
    assertThat(account.client().delete("/api/v1/account/sessions/" + secondHandle).status())
        .isEqualTo(204);
    assertThat(second.get("/api/v1/auth/me").status()).isEqualTo(401);
    assertThat(third.get("/api/v1/auth/me").status()).isEqualTo(200);

    Response unknown = account.client().delete("/api/v1/account/sessions/" + "0".repeat(32));
    assertThat(unknown.code()).isEqualTo("NOT_FOUND");

    assertThat(account.client().delete("/api/v1/account/sessions").status()).isEqualTo(204);
    assertThat(third.get("/api/v1/auth/me").status()).isEqualTo(401);
    assertThat(account.client().get("/api/v1/auth/me").status()).isEqualTo(200);
  }

  @Test
  void deletingTheAccountRemovesAllItsDataAndSessions() {
    Account account = signedInAccount();
    ApiClient other = signIn(account);
    account.client().post("/api/v1/vault/records", newRecord(UUID.randomUUID()));

    Response wrongConfirmation =
        account
            .client()
            .post(
                "/api/v1/account/deletion",
                Map.of("accountPassword", account.password(), "confirmation", "delete"));
    assertThat(wrongConfirmation.code()).isEqualTo("VALIDATION_FAILED");
    Response wrongPassword =
        account
            .client()
            .post(
                "/api/v1/account/deletion",
                Map.of(
                    "accountPassword",
                    "wrong-" + account.password(),
                    "confirmation",
                    "DELETE MY ACCOUNT"));
    assertThat(wrongPassword.code()).isEqualTo("STEP_UP_FAILED");

    Response deleted =
        account
            .client()
            .post(
                "/api/v1/account/deletion",
                Map.of("accountPassword", account.password(), "confirmation", "DELETE MY ACCOUNT"));

    assertThat(deleted.status()).isEqualTo(204);
    assertThat(account.client().session).isNull();
    assertThat(other.get("/api/v1/auth/me").status()).isEqualTo(401);
    for (String table :
        List.of(
            "users WHERE id",
            "vaults WHERE user_id",
            "vault_records WHERE user_id",
            "audit_events WHERE user_id",
            "one_time_tokens WHERE user_id")) {
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM " + table + " = ?", Long.class, account.id()))
          .as(table)
          .isZero();
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM spring_session WHERE principal_name = ?",
                Long.class,
                account.id().toString()))
        .isZero();
  }
}
