package com.securevault.auth;

import com.securevault.common.ratelimit.RateLimitRule;
import com.securevault.common.ratelimit.RateLimiter;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * Login limits from ARCHITECTURE section 7. Three layers: a tight limit per IP and email, a per-IP
 * limit against spraying many accounts, and a per-email limit against attempts spread across many
 * IPs. Accounts are never locked, since that would let attackers lock out victims.
 */
@Component
class LoginRateLimits {

  private final RateLimiter perIpAndEmail =
      new RateLimiter(new RateLimitRule("login-ip-email", 5, Duration.ofMinutes(1)));
  private final RateLimiter perIp =
      new RateLimiter(new RateLimitRule("login-ip", 20, Duration.ofMinutes(1)));
  private final RateLimiter perEmail =
      new RateLimiter(new RateLimitRule("login-email", 30, Duration.ofMinutes(15)));

  void check(String clientIp, String normalizedEmail) {
    perIpAndEmail.consume(clientIp + "|" + normalizedEmail);
    perIp.consume(clientIp);
    perEmail.consume(normalizedEmail);
  }
}
