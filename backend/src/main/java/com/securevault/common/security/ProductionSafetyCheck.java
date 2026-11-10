package com.securevault.common.security;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Refuses to start the `prod` profile with settings that are only acceptable on a developer's
 * machine. Failing at startup is better than running quietly with an insecure cookie.
 */
@Component
@Profile("prod")
class ProductionSafetyCheck implements InitializingBean {

  private final SecurityProperties properties;

  ProductionSafetyCheck(SecurityProperties properties) {
    this.properties = properties;
  }

  @Override
  public void afterPropertiesSet() {
    List<String> problems = new ArrayList<>();
    if (!properties.sessionCookieSecure()) {
      problems.add("the session cookie must be Secure");
    }
    String name = properties.sessionCookieName();
    if (name == null || !name.startsWith("__Host-")) {
      problems.add("the session cookie name must start with __Host-");
    }
    List<String> origins =
        properties.allowedOrigins() == null ? List.of() : properties.allowedOrigins();
    if (origins.isEmpty()
        || origins.stream().anyMatch(o -> o == null || !o.startsWith("https://"))) {
      problems.add("allowed origins must be set and must all use https");
    }
    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "Unsafe production configuration: " + String.join("; ", problems));
    }
  }
}
