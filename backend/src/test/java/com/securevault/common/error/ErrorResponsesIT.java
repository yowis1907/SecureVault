package com.securevault.common.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;

import com.securevault.testsupport.ApiClient;
import com.securevault.testsupport.ApiClient.Response;
import com.securevault.testsupport.ApiTestBase;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Error codes that do not belong to one feature. Each response is RFC 9457 problem JSON. */
class ErrorResponsesIT extends ApiTestBase {

  @Test
  void anUnsupportedMethodIs405() {
    ApiClient api = signedInAccount().client();
    Response response = api.send(delete("/api/v1/auth/me"));
    assertThat(response.status()).isEqualTo(405);
    assertThat(response.code()).isEqualTo("METHOD_NOT_ALLOWED");
  }

  @Test
  void aNonJsonBodyIs415() {
    ApiClient api = client().fetchCsrf();
    Response response = api.postRaw("/api/v1/auth/login", "text/plain", "email=a&password=b");
    assertThat(response.status()).isEqualTo(415);
    assertThat(response.code()).isEqualTo("UNSUPPORTED_MEDIA_TYPE");
  }

  @Test
  void aPathOutsideTheApiIs403ForASignedInUser() {
    Response response = signedInAccount().client().get("/login");
    assertThat(response.status()).isEqualTo(403);
    assertThat(response.code()).isEqualTo("FORBIDDEN");
  }

  @Test
  void eachSignedInUserIsLimitedTo300RequestsPerMinute() {
    ApiClient api = signedInAccount().client();
    // The bucket refills gradually, 5 tokens a second, so a few extra requests get through while
    // this loop runs. What matters: the full burst of 300 is allowed, then requests are refused.
    // signedInAccount already used one token for the CSRF fetch after login.
    int allowed = 0;
    Response limited = null;
    for (int i = 0; i < 400 && limited == null; i++) {
      Response response = api.get("/api/v1/auth/me");
      if (response.status() == 429) {
        limited = response;
      } else {
        assertThat(response.status()).isEqualTo(200);
        allowed++;
      }
    }
    assertThat(allowed).isGreaterThanOrEqualTo(299);
    assertThat(limited).isNotNull();
    assertThat(limited.code()).isEqualTo("RATE_LIMITED");
    assertThat(limited.header("Retry-After")).isNotBlank();
  }

  /** Found in the Phase 6 audit: a NUL character reached PostgreSQL and came back as a 500. */
  @Test
  void controlCharactersInAnEmailAreAValidationErrorNotAServerError() {
    ApiClient api = client().fetchCsrf();
    // JSON escapes, so the request body itself stays valid JSON.
    for (String escape : List.of("\\u0000", "\\u0007", "\\n")) {
      String email = "a" + escape + "b@example.test";
      String login = "{\"email\":\"" + email + "\",\"accountPassword\":\"x\"}";
      String only = "{\"email\":\"" + email + "\"}";
      assertThat(api.postRaw("/api/v1/auth/login", "application/json", login).code())
          .isEqualTo("VALIDATION_FAILED");
      assertThat(api.postRaw("/api/v1/auth/password/forgot", "application/json", only).code())
          .isEqualTo("VALIDATION_FAILED");
      assertThat(api.postRaw("/api/v1/auth/verification/resend", "application/json", only).code())
          .isEqualTo("VALIDATION_FAILED");
    }
  }

  @Test
  void csrfTokensAreLimitedPerIp() {
    ApiClient api = client();
    for (int i = 0; i < 30; i++) {
      assertThat(api.get("/api/v1/auth/csrf").status()).isEqualTo(200);
    }
    assertThat(api.get("/api/v1/auth/csrf").code()).isEqualTo("RATE_LIMITED");
  }
}
