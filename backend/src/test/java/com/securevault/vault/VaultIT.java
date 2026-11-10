package com.securevault.vault;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class VaultIT extends ApiTestBase {

  private static Map<String, Object> keyUpdate(String password, int expectedVersion) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountPassword", password);
    body.put("expectedKeyVersion", expectedVersion);
    body.put("kdf", kdf());
    body.put("wrappedDek", base64(randomBytes(48)));
    body.put("wrapNonce", base64(randomBytes(12)));
    return body;
  }

  @Test
  void returnsExactlyTheKeyMaterialStoredAtRegistration() {
    Account account = signedInAccount();
    Response vault = account.client().get("/api/v1/vault");

    assertThat(vault.status()).isEqualTo(200);
    assertThat(vault.<String>json("$.vaultId")).isEqualTo(account.vault().get("vaultId"));
    assertThat(vault.<String>json("$.wrappedDek")).isEqualTo(account.vault().get("wrappedDek"));
    assertThat(vault.<String>json("$.wrapNonce")).isEqualTo(account.vault().get("wrapNonce"));
    assertThat(vault.<String>json("$.kdf.salt"))
        .isEqualTo(((Map<?, ?>) account.vault().get("kdf")).get("salt"));
    assertThat(vault.<Integer>json("$.keyVersion")).isEqualTo(1);
    assertThat(vault.<Object>json("$.settings")).isNull();
  }

  @Test
  void needsASession() {
    Response response = client().get("/api/v1/vault");
    assertThat(response.status()).isEqualTo(401);
    assertThat(response.code()).isEqualTo("UNAUTHENTICATED");
  }

  @Test
  void storesEncryptedSettingsWithinTheSizeLimit() {
    Account account = signedInAccount();
    String nonce = base64(randomBytes(12));
    String ciphertext = base64(randomBytes(272));

    assertThat(
            account
                .client()
                .put("/api/v1/vault/settings", Map.of("nonce", nonce, "ciphertext", ciphertext))
                .status())
        .isEqualTo(204);
    Response vault = account.client().get("/api/v1/vault");
    assertThat(vault.<String>json("$.settings.ciphertext")).isEqualTo(ciphertext);
    assertThat(vault.<String>json("$.settings.nonce")).isEqualTo(nonce);

    Response tooBig =
        account
            .client()
            .put(
                "/api/v1/vault/settings",
                Map.of("nonce", nonce, "ciphertext", base64(randomBytes(8193))));
    assertThat(tooBig.code()).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  void masterPasswordChangeReplacesTheWrappedKeyOnce() {
    Account account = signedInAccount();
    Map<String, Object> update = keyUpdate(account.password(), 1);

    Response changed = account.client().put("/api/v1/vault/key-material", update);

    assertThat(changed.status()).isEqualTo(200);
    assertThat(changed.<Integer>json("$.keyVersion")).isEqualTo(2);
    Response vault = account.client().get("/api/v1/vault");
    assertThat(vault.<String>json("$.wrappedDek")).isEqualTo(update.get("wrappedDek"));
    assertThat(vault.<String>json("$.kdf.salt"))
        .isEqualTo(((Map<?, ?>) update.get("kdf")).get("salt"));

    Response stale =
        account.client().put("/api/v1/vault/key-material", keyUpdate(account.password(), 1));
    assertThat(stale.status()).isEqualTo(409);
    assertThat(stale.code()).isEqualTo("VERSION_CONFLICT");
    assertThat(account.client().get("/api/v1/vault").<String>json("$.wrappedDek"))
        .isEqualTo(update.get("wrappedDek"));
  }

  @Test
  void masterPasswordChangeNeedsTheAccountPassword() {
    Account account = signedInAccount();
    Response response =
        account
            .client()
            .put("/api/v1/vault/key-material", keyUpdate("wrong-" + account.password(), 1));

    assertThat(response.status()).isEqualTo(403);
    assertThat(response.code()).isEqualTo("STEP_UP_FAILED");
    assertThat(account.client().get("/api/v1/vault").<String>json("$.wrappedDek"))
        .isEqualTo(account.vault().get("wrappedDek"));
  }

  @Test
  void weakenedKdfParametersAreRejected() {
    Account account = signedInAccount();
    Map<String, Object> update = keyUpdate(account.password(), 1);
    Map<String, Object> weak = new HashMap<>(kdf());
    weak.put("memoryKib", 1024);
    update.put("kdf", weak);
    assertThat(account.client().put("/api/v1/vault/key-material", update).code())
        .isEqualTo("VALIDATION_FAILED");
  }

  @Test
  void stepUpAttemptsAreLimited() {
    Account account = signedInAccount();
    for (int i = 0; i < 5; i++) {
      assertThat(
              account.client().put("/api/v1/vault/key-material", keyUpdate("wrong-" + i, 1)).code())
          .isEqualTo("STEP_UP_FAILED");
    }
    Response limited =
        account.client().put("/api/v1/vault/key-material", keyUpdate(account.password(), 1));
    assertThat(limited.status()).isEqualTo(429);
  }

  @Test
  void resetDestroysEveryRecordAndInstallsTheNewVault() {
    Account account = signedInAccount();
    UUID recordId = UUID.randomUUID();
    account.client().post("/api/v1/vault/records", newRecord(recordId));
    Map<String, Object> newVault = vaultMaterial();

    Response wrongConfirmation =
        account
            .client()
            .post(
                "/api/v1/vault/reset",
                Map.of(
                    "accountPassword",
                    account.password(),
                    "confirmation",
                    "delete my vault",
                    "vault",
                    newVault));
    assertThat(wrongConfirmation.code()).isEqualTo("VALIDATION_FAILED");

    Response wrongPassword =
        account
            .client()
            .post(
                "/api/v1/vault/reset",
                Map.of(
                    "accountPassword",
                    "wrong-" + account.password(),
                    "confirmation",
                    "DELETE MY VAULT",
                    "vault",
                    newVault));
    assertThat(wrongPassword.code()).isEqualTo("STEP_UP_FAILED");
    assertThat(account.client().get("/api/v1/vault/records/" + recordId).status()).isEqualTo(200);

    Response reset =
        account
            .client()
            .post(
                "/api/v1/vault/reset",
                Map.of(
                    "accountPassword",
                    account.password(),
                    "confirmation",
                    "DELETE MY VAULT",
                    "vault",
                    newVault));

    assertThat(reset.status()).isEqualTo(204);
    assertThat(account.client().get("/api/v1/vault/records/" + recordId).status()).isEqualTo(404);
    Response vault = account.client().get("/api/v1/vault");
    assertThat(vault.<String>json("$.vaultId")).isEqualTo(newVault.get("vaultId"));
    assertThat(vault.<String>json("$.wrappedDek")).isEqualTo(newVault.get("wrappedDek"));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM vault_records WHERE user_id = ?", Long.class, account.id()))
        .isZero();
  }
}
