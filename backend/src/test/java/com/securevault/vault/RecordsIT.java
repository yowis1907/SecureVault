package com.securevault.vault;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecordsIT extends ApiTestBase {

  private static Map<String, Object> update(long version) {
    return Map.of(
        "version",
        version,
        "cryptoVersion",
        1,
        "nonce",
        base64(randomBytes(12)),
        "ciphertext",
        base64(randomBytes(528)));
  }

  @Test
  void createReadUpdateDeleteRoundTripsTheExactBytes() {
    ApiClient api = signedInAccount().client();
    UUID id = UUID.randomUUID();
    Map<String, Object> record = newRecord(id);

    Response created = api.post("/api/v1/vault/records", record);
    assertThat(created.status()).isEqualTo(201);
    assertThat(created.<Integer>json("$.version")).isEqualTo(1);
    assertThat(created.<String>json("$.ciphertext")).isEqualTo(record.get("ciphertext"));

    Response read = api.get("/api/v1/vault/records/" + id);
    assertThat(read.<String>json("$.nonce")).isEqualTo(record.get("nonce"));
    assertThat(read.<String>json("$.type")).isEqualTo("LOGIN");

    Map<String, Object> change = update(1);
    Response updated = api.put("/api/v1/vault/records/" + id, change);
    assertThat(updated.status()).isEqualTo(200);
    assertThat(updated.<Integer>json("$.version")).isEqualTo(2);
    assertThat(updated.<String>json("$.ciphertext")).isEqualTo(change.get("ciphertext"));

    assertThat(api.delete("/api/v1/vault/records/" + id).status()).isEqualTo(204);
    Response gone = api.get("/api/v1/vault/records/" + id);
    assertThat(gone.status()).isEqualTo(404);
    assertThat(gone.code()).isEqualTo("NOT_FOUND");
    assertThat(api.delete("/api/v1/vault/records/" + id).status()).isEqualTo(404);
  }

  @Test
  void aStaleVersionIsRejectedAndChangesNothing() {
    ApiClient api = signedInAccount().client();
    UUID id = UUID.randomUUID();
    api.post("/api/v1/vault/records", newRecord(id));
    Map<String, Object> first = update(1);
    api.put("/api/v1/vault/records/" + id, first);

    Response stale = api.put("/api/v1/vault/records/" + id, update(1));

    assertThat(stale.status()).isEqualTo(409);
    assertThat(stale.code()).isEqualTo("VERSION_CONFLICT");
    assertThat(api.get("/api/v1/vault/records/" + id).<String>json("$.ciphertext"))
        .isEqualTo(first.get("ciphertext"));
    assertThat(api.put("/api/v1/vault/records/" + UUID.randomUUID(), update(1)).code())
        .isEqualTo("NOT_FOUND");
  }

  @Test
  void aRecordIdCanOnlyBeUsedOnce() {
    ApiClient api = signedInAccount().client();
    UUID id = UUID.randomUUID();
    api.post("/api/v1/vault/records", newRecord(id));

    Response duplicate = api.post("/api/v1/vault/records", newRecord(id));

    assertThat(duplicate.status()).isEqualTo(409);
    assertThat(duplicate.code()).isEqualTo("RECORD_ID_CONFLICT");
  }

  @Test
  void listingPagesThroughEveryRecordInIdOrder() {
    ApiClient api = signedInAccount().client();
    List<String> ids = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      UUID id = UUID.randomUUID();
      ids.add(id.toString());
      api.post("/api/v1/vault/records", newRecord(id));
    }

    List<String> seen = new ArrayList<>();
    String cursor = null;
    int pages = 0;
    do {
      Response page =
          api.get("/api/v1/vault/records?limit=2" + (cursor == null ? "" : "&cursor=" + cursor));
      assertThat(page.status()).isEqualTo(200);
      seen.addAll(page.json("$.records[*].id"));
      cursor = page.json("$.nextCursor");
      pages++;
    } while (cursor != null);

    assertThat(pages).isEqualTo(3);
    assertThat(seen).containsExactlyElementsOf(ids.stream().sorted().toList());
  }

  @Test
  void aBatchIsAllOrNothing() {
    ApiClient api = signedInAccount().client();
    UUID existing = UUID.randomUUID();
    api.post("/api/v1/vault/records", newRecord(existing));
    List<Map<String, Object>> good =
        List.of(newRecord(UUID.randomUUID()), newRecord(UUID.randomUUID()));

    Response created = api.post("/api/v1/vault/records/batch", Map.of("records", good));
    assertThat(created.status()).isEqualTo(201);
    assertThat(created.<List<?>>json("$.records")).hasSize(2);

    UUID fresh = UUID.randomUUID();
    Response conflict =
        api.post(
            "/api/v1/vault/records/batch",
            Map.of("records", List.of(newRecord(fresh), newRecord(existing))));
    assertThat(conflict.code()).isEqualTo("RECORD_ID_CONFLICT");
    assertThat(api.get("/api/v1/vault/records/" + fresh).status()).isEqualTo(404);

    List<Map<String, Object>> tooMany = new ArrayList<>();
    for (int i = 0; i < 201; i++) {
      tooMany.add(newRecord(UUID.randomUUID()));
    }
    assertThat(api.post("/api/v1/vault/records/batch", Map.of("records", tooMany)).code())
        .isEqualTo("VALIDATION_FAILED");
  }

  @Test
  void theQuotaIs5000RecordsIncludingBatches() {
    Account account = signedInAccount();
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        "INSERT INTO vault_records (id, user_id, record_type, crypto_version, nonce, ciphertext,"
            + " version, created_at, updated_at)"
            + " SELECT gen_random_uuid(), ?, 'LOGIN', 1, decode(repeat('00', 12), 'hex'),"
            + " decode(repeat('00', 16), 'hex'), 1, ?, ? FROM generate_series(1, 4998)",
        account.id(),
        now,
        now);
    ApiClient api = account.client();

    assertThat(
            api.post(
                    "/api/v1/vault/records/batch",
                    Map.of(
                        "records",
                        List.of(
                            newRecord(UUID.randomUUID()),
                            newRecord(UUID.randomUUID()),
                            newRecord(UUID.randomUUID()))))
                .code())
        .isEqualTo("QUOTA_EXCEEDED");
    assertThat(api.post("/api/v1/vault/records", newRecord(UUID.randomUUID())).status())
        .isEqualTo(201);
    assertThat(api.post("/api/v1/vault/records", newRecord(UUID.randomUUID())).status())
        .isEqualTo(201);

    Response over = api.post("/api/v1/vault/records", newRecord(UUID.randomUUID()));
    assertThat(over.status()).isEqualTo(422);
    assertThat(over.code()).isEqualTo("QUOTA_EXCEEDED");
  }

  @Test
  void malformedRecordsAndParametersAreRejected() {
    ApiClient api = signedInAccount().client();
    List<Map<String, Object>> invalid =
        List.of(
            with("nonce", base64(randomBytes(11))),
            with("ciphertext", base64(randomBytes(15))),
            with("ciphertext", base64(randomBytes(65537))),
            with("type", "NOTE"),
            with("cryptoVersion", 2),
            with("id", "not-a-uuid"),
            with("title", "plaintext must not be accepted"));
    for (Map<String, Object> body : invalid) {
      Response response = api.post("/api/v1/vault/records", body);
      assertThat(response.status()).as(body.keySet().toString()).isEqualTo(400);
      assertThat(response.code()).isEqualTo("VALIDATION_FAILED");
    }

    for (String path :
        List.of(
            "/api/v1/vault/records/not-a-uuid",
            "/api/v1/vault/records?limit=0",
            "/api/v1/vault/records?limit=1001",
            "/api/v1/vault/records?cursor=not-a-uuid")) {
      assertThat(api.get(path).code()).as(path).isEqualTo("VALIDATION_FAILED");
    }
  }

  @Test
  void bodiesOverTheLimitAreRefusedWith413() {
    ApiClient api = signedInAccount().client();
    String padding = "a".repeat(300 * 1024);
    Response single =
        api.postRaw(
            "/api/v1/vault/records", "application/json", "{\"padding\":\"" + padding + "\"}");
    assertThat(single.status()).isEqualTo(413);
    assertThat(single.code()).isEqualTo("PAYLOAD_TOO_LARGE");

    // The batch endpoint accepts up to 8 MiB, so 300 KiB is not too large there.
    Response batch =
        api.postRaw(
            "/api/v1/vault/records/batch", "application/json", "{\"padding\":\"" + padding + "\"}");
    assertThat(batch.code()).isEqualTo("VALIDATION_FAILED");

    String huge = "a".repeat(9 * 1024 * 1024);
    assertThat(
            api.postRaw(
                    "/api/v1/vault/records/batch", "application/json", "{\"p\":\"" + huge + "\"}")
                .code())
        .isEqualTo("PAYLOAD_TOO_LARGE");
  }

  private static Map<String, Object> with(String key, Object value) {
    Map<String, Object> record = new HashMap<>(newRecord(UUID.randomUUID()));
    record.put(key, value);
    return record;
  }
}
