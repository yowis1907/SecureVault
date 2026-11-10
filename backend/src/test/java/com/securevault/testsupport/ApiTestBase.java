package com.securevault.testsupport;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/**
 * Shared helpers for API tests. Users are created through the real registration and email
 * verification endpoints, not inserted directly, so every test also exercises that path. All
 * passwords and key material are random test values.
 */
@IntegrationTest
public abstract class ApiTestBase {

  private static final SecureRandom RANDOM = new SecureRandom();

  @Autowired protected MockMvc mockMvc;
  @Autowired protected JsonMapper json;
  @Autowired protected JdbcTemplate jdbc;
  @Autowired protected RecordingMailer mailer;
  @Autowired protected MutableClock clock;

  public record Account(
      UUID id, String email, String password, Map<String, Object> vault, ApiClient client) {}

  protected ApiClient client() {
    return new ApiClient(mockMvc, json);
  }

  protected static byte[] randomBytes(int length) {
    byte[] bytes = new byte[length];
    RANDOM.nextBytes(bytes);
    return bytes;
  }

  protected static String base64(byte[] bytes) {
    return Base64.getEncoder().encodeToString(bytes);
  }

  protected static Map<String, Object> kdf() {
    Map<String, Object> kdf = new HashMap<>();
    kdf.put("algorithm", "ARGON2ID");
    kdf.put("memoryKib", 65536);
    kdf.put("iterations", 3);
    kdf.put("parallelism", 1);
    kdf.put("salt", base64(randomBytes(16)));
    return kdf;
  }

  /** Well-formed key material. The server cannot tell it from real output, which is the point. */
  protected static Map<String, Object> vaultMaterial() {
    Map<String, Object> vault = new HashMap<>();
    vault.put("vaultId", UUID.randomUUID().toString());
    vault.put("cryptoVersion", 1);
    vault.put("kdf", kdf());
    vault.put("wrappedDek", base64(randomBytes(48)));
    vault.put("wrapNonce", base64(randomBytes(12)));
    return vault;
  }

  protected static String newEmail() {
    return "user-" + UUID.randomUUID() + "@example.test";
  }

  protected static String newPassword() {
    return "test-password-" + UUID.randomUUID();
  }

  protected static Map<String, Object> registration(
      String email, String password, Map<String, Object> vault) {
    return Map.of("email", email, "accountPassword", password, "vault", vault);
  }

  /** Registers, follows the emailed link, signs in, and returns a client ready for requests. */
  protected Account signedInAccount() {
    String email = newEmail();
    String password = newPassword();
    Map<String, Object> vault = vaultMaterial();
    ApiClient client = client().fetchCsrf();
    assertThat(client.post("/api/v1/auth/register", registration(email, password, vault)).status())
        .isEqualTo(202);
    assertThat(
            client
                .post("/api/v1/auth/verify-email", Map.of("token", mailer.latestToken(email)))
                .status())
        .isEqualTo(204);
    ApiClient.Response login = client.login(email, password);
    assertThat(login.status()).isEqualTo(200);
    client.fetchCsrf();
    return new Account(UUID.fromString(login.json("$.id")), email, password, vault, client);
  }

  protected ApiClient signIn(Account account) {
    ApiClient client = client().fetchCsrf();
    assertThat(client.login(account.email(), account.password()).status()).isEqualTo(200);
    return client.fetchCsrf();
  }

  protected static Map<String, Object> newRecord(UUID id) {
    return Map.of(
        "id", id.toString(),
        "type", "LOGIN",
        "cryptoVersion", 1,
        "nonce", base64(randomBytes(12)),
        "ciphertext", base64(randomBytes(272)));
  }
}
