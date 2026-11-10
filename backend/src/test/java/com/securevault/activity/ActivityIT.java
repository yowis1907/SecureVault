package com.securevault.activity;

import static org.assertj.core.api.Assertions.assertThat;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ActivityIT extends ApiTestBase {

  @Test
  void recordsWhatHappenedNewestFirstWithoutAnyRecordContent() {
    Account account = signedInAccount();
    ApiClient api = account.client();
    UUID id = UUID.randomUUID();
    Map<String, Object> record = newRecord(id);
    api.post("/api/v1/vault/records", record);
    api.put(
        "/api/v1/vault/records/" + id,
        Map.of(
            "version",
            1,
            "cryptoVersion",
            1,
            "nonce",
            base64(randomBytes(12)),
            "ciphertext",
            base64(randomBytes(32))));
    api.delete("/api/v1/vault/records/" + id);

    Response activity = api.get("/api/v1/activity");

    assertThat(activity.status()).isEqualTo(200);
    List<String> types = activity.json("$.events[*].type");
    assertThat(types)
        .containsExactly("RECORD_DELETED", "RECORD_UPDATED", "RECORD_CREATED", "LOGIN_SUCCEEDED");
    assertThat(activity.<List<String>>json("$.events[0:3].recordId")).containsOnly(id.toString());
    assertThat(activity.body()).doesNotContain((String) record.get("ciphertext"));
  }

  @Test
  void theLimitIsRespectedAndValidated() {
    ApiClient api = signedInAccount().client();
    for (int i = 0; i < 3; i++) {
      api.post("/api/v1/vault/records", newRecord(UUID.randomUUID()));
    }
    assertThat(api.get("/api/v1/activity?limit=2").<List<?>>json("$.events")).hasSize(2);
    assertThat(api.get("/api/v1/activity?limit=0").code()).isEqualTo("VALIDATION_FAILED");
    assertThat(api.get("/api/v1/activity?limit=201").code()).isEqualTo("VALIDATION_FAILED");
  }
}
