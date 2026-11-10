package com.securevault.vault;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Insecure direct object reference suite: user B tries every record and session endpoint against
 * user A's IDs. Each attempt must look exactly like a missing record, and A's data must not change.
 */
class IdorIT extends ApiTestBase {

  private Account alice;
  private Account bob;
  private UUID aliceRecord;
  private String aliceCiphertext;

  @BeforeEach
  void twoUsers() {
    alice = signedInAccount();
    bob = signedInAccount();
    aliceRecord = UUID.randomUUID();
    Map<String, Object> record = newRecord(aliceRecord);
    aliceCiphertext = (String) record.get("ciphertext");
    assertThat(alice.client().post("/api/v1/vault/records", record).status()).isEqualTo(201);
  }

  private void assertAliceUnchanged() {
    Response read = alice.client().get("/api/v1/vault/records/" + aliceRecord);
    assertThat(read.status()).isEqualTo(200);
    assertThat(read.<String>json("$.ciphertext")).isEqualTo(aliceCiphertext);
    assertThat(read.<Integer>json("$.version")).isEqualTo(1);
  }

  @Test
  void anotherUsersRecordCannotBeRead() {
    Response response = bob.client().get("/api/v1/vault/records/" + aliceRecord);
    assertThat(response.status()).isEqualTo(404);
    assertThat(response.code()).isEqualTo("NOT_FOUND");
    assertThat(response.body()).doesNotContain(aliceCiphertext);
  }

  @Test
  void anotherUsersRecordCannotBeUpdated() {
    Response response =
        bob.client()
            .put(
                "/api/v1/vault/records/" + aliceRecord,
                Map.of(
                    "version",
                    1,
                    "cryptoVersion",
                    1,
                    "nonce",
                    base64(randomBytes(12)),
                    "ciphertext",
                    base64(randomBytes(32))));
    assertThat(response.status()).isEqualTo(404);
    assertThat(response.code()).isEqualTo("NOT_FOUND");
    assertAliceUnchanged();
  }

  @Test
  void anotherUsersRecordCannotBeDeleted() {
    Response response = bob.client().delete("/api/v1/vault/records/" + aliceRecord);
    assertThat(response.status()).isEqualTo(404);
    assertAliceUnchanged();
  }

  @Test
  void anotherUsersRecordNeverAppearsInAListing() {
    bob.client().post("/api/v1/vault/records", newRecord(UUID.randomUUID()));
    Response page = bob.client().get("/api/v1/vault/records?limit=1000");
    List<String> ids = page.json("$.records[*].id");
    assertThat(ids).hasSize(1).doesNotContain(aliceRecord.toString());

    Response afterCursor =
        bob.client().get("/api/v1/vault/records?cursor=00000000-0000-0000-0000-000000000000");
    assertThat(afterCursor.<List<String>>json("$.records[*].id"))
        .doesNotContain(aliceRecord.toString());
  }

  @Test
  void reusingAnotherUsersRecordIdCannotOverwriteIt() {
    // The ID is taken, so this conflicts. It does not reveal content, and IDs are random UUIDs
    // that another user has no way to learn.
    Response single = bob.client().post("/api/v1/vault/records", newRecord(aliceRecord));
    assertThat(single.code()).isEqualTo("RECORD_ID_CONFLICT");
    Response batch =
        bob.client()
            .post(
                "/api/v1/vault/records/batch", Map.of("records", List.of(newRecord(aliceRecord))));
    assertThat(batch.code()).isEqualTo("RECORD_ID_CONFLICT");
    assertAliceUnchanged();
  }

  @Test
  void eachUserSeesOnlyTheirOwnVaultAndActivity() {
    assertThat(bob.client().get("/api/v1/vault").<String>json("$.vaultId"))
        .isEqualTo(bob.vault().get("vaultId"));
    List<String> bobRecordIds = bob.client().get("/api/v1/activity").json("$.events[*].recordId");
    assertThat(bobRecordIds).doesNotContain(aliceRecord.toString());
  }

  @Test
  void aVaultResetCannotReuseAnotherUsersVaultId() {
    UUID bobRecord = UUID.randomUUID();
    bob.client().post("/api/v1/vault/records", newRecord(bobRecord));
    Map<String, Object> stolenId = new java.util.HashMap<>(vaultMaterial());
    stolenId.put("vaultId", alice.vault().get("vaultId"));

    Response response =
        bob.client()
            .post(
                "/api/v1/vault/reset",
                Map.of(
                    "accountPassword",
                    bob.password(),
                    "confirmation",
                    "DELETE MY VAULT",
                    "vault",
                    stolenId));

    assertThat(response.status()).isEqualTo(400);
    assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
    // The whole reset rolled back: Bob's own record and vault survive, and Alice is untouched.
    assertThat(bob.client().get("/api/v1/vault/records/" + bobRecord).status()).isEqualTo(200);
    assertThat(bob.client().get("/api/v1/vault").<String>json("$.vaultId"))
        .isEqualTo(bob.vault().get("vaultId"));
    assertThat(alice.client().get("/api/v1/vault").<String>json("$.wrappedDek"))
        .isEqualTo(alice.vault().get("wrappedDek"));
  }

  @Test
  void anotherUsersSessionCannotBeRevoked() {
    String aliceHandle =
        alice.client().get("/api/v1/account/sessions").json("$.sessions[0].handle");
    Response response = bob.client().delete("/api/v1/account/sessions/" + aliceHandle);
    assertThat(response.status()).isEqualTo(404);
    assertThat(alice.client().get("/api/v1/auth/me").status()).isEqualTo(200);
  }
}
