package com.securevault.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/** An unexpected failure must not leak its message, which can contain SQL values or input. */
class GlobalExceptionHandlerTest {

  @Test
  void anUnexpectedExceptionBecomesAGeneric500() {
    ResponseEntity<Map<String, Object>> response =
        new GlobalExceptionHandler()
            .unexpected(
                new IllegalStateException("duplicate key value (email)=(secret@example.test)"));

    assertThat(response.getStatusCode().value()).isEqualTo(500);
    assertThat(response.getBody())
        .containsEntry("code", "INTERNAL_ERROR")
        .containsEntry("title", "Internal error")
        .containsKey("traceId");
    assertThat(response.getBody().toString()).doesNotContain("secret@example.test", "duplicate");
  }
}
