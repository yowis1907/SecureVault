package com.securevault.common.security;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Settings under `securevault.security`. Defaults live in application.yaml; the `prod` profile
 * overrides them and is checked at startup by {@link ProductionSafetyCheck}.
 *
 * @param allowedOrigins browser origins allowed to make state-changing requests
 * @param sessionCookieName `__Host-SV_SESSION` in production; local HTTP cannot use that prefix
 * @param sessionCookieSecure whether the cookie is sent only over HTTPS
 * @param absoluteSessionTimeout maximum session age, however active the user is
 * @param anonymousSessionTimeout idle lifetime of a pre-login session that holds only a CSRF token
 * @param maxConcurrentPasswordHashes Argon2 hashes allowed at once, bounding memory use
 */
@ConfigurationProperties("securevault.security")
public record SecurityProperties(
    List<String> allowedOrigins,
    String sessionCookieName,
    boolean sessionCookieSecure,
    Duration absoluteSessionTimeout,
    Duration anonymousSessionTimeout,
    int maxConcurrentPasswordHashes) {}
