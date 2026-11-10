package com.securevault.common.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProductionSafetyCheckTest {

  private static ProductionSafetyCheck check(
      String cookieName, boolean secure, List<String> origins) {
    return new ProductionSafetyCheck(
        new SecurityProperties(
            origins, cookieName, secure, Duration.ofHours(8), Duration.ofMinutes(10), 4));
  }

  @Test
  void acceptsSecureSettings() {
    assertThatCode(
            check("__Host-SV_SESSION", true, List.of("https://vault.example.test"))
                ::afterPropertiesSet)
        .doesNotThrowAnyException();
  }

  @Test
  void refusesAnInsecureCookie() {
    assertThatThrownBy(
            check("__Host-SV_SESSION", false, List.of("https://vault.example.test"))
                ::afterPropertiesSet)
        .hasMessageContaining("Secure");
  }

  @Test
  void refusesACookieWithoutTheHostPrefix() {
    assertThatThrownBy(
            check("SV_SESSION", true, List.of("https://vault.example.test"))::afterPropertiesSet)
        .hasMessageContaining("__Host-");
  }

  @Test
  void refusesMissingOrPlainHttpOrigins() {
    for (List<String> bad :
        List.of(List.<String>of(), List.of(""), List.of("http://vault.example.test"))) {
      assertThatThrownBy(check("__Host-SV_SESSION", true, bad)::afterPropertiesSet)
          .hasMessageContaining("https");
    }
  }
}
