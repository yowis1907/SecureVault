package com.securevault.auth;

import com.securevault.common.ratelimit.RateLimitRule;
import com.securevault.common.ratelimit.RateLimitedException;
import com.securevault.common.ratelimit.RateLimiter;
import java.time.Duration;
import org.springframework.stereotype.Component;

/**
 * Limits for the public endpoints, from ARCHITECTURE section 7. Accounts are never locked, since
 * that would let attackers lock out victims.
 */
@Component
class AuthRateLimits {

  // Login: a tight limit per IP and email, a per-IP limit against trying many accounts, and a
  // per-email limit against attempts spread across many IPs.
  private final RateLimiter loginPerIpAndEmail =
      limiter("login-ip-email", 5, Duration.ofMinutes(1));
  private final RateLimiter loginPerIp = limiter("login-ip", 20, Duration.ofMinutes(1));
  private final RateLimiter loginPerEmail = limiter("login-email", 30, Duration.ofMinutes(15));

  private final RateLimiter registerPerIp = limiter("register-ip", 5, Duration.ofHours(1));
  private final RateLimiter emailPerIp = limiter("email-ip", 10, Duration.ofHours(1));
  private final RateLimiter emailPerAddress = limiter("email-address", 3, Duration.ofHours(1));
  private final RateLimiter tokenPerIp = limiter("token-ip", 10, Duration.ofHours(1));
  private final RateLimiter csrfPerIp = limiter("csrf-ip", 30, Duration.ofMinutes(1));

  private static RateLimiter limiter(String name, long capacity, Duration period) {
    return new RateLimiter(new RateLimitRule(name, capacity, period));
  }

  void login(String clientIp, String normalizedEmail) {
    loginPerIpAndEmail.consume(clientIp + "|" + normalizedEmail);
    loginPerIp.consume(clientIp);
    loginPerEmail.consume(normalizedEmail);
  }

  void register(String clientIp) {
    registerPerIp.consume(clientIp);
  }

  /** Each CSRF fetch by a visitor creates a short-lived session, so it is limited too. */
  void csrf(String clientIp) {
    csrfPerIp.consume(clientIp);
  }

  void tokenSubmission(String clientIp) {
    tokenPerIp.consume(clientIp);
  }

  /**
   * For forgot-password and resend-verification. Too many requests from one IP get a 429. Too many
   * for one address are dropped silently: a 429 there would confirm the account exists.
   *
   * @return whether an email may be sent
   */
  boolean emailRequest(String clientIp, String normalizedEmail) {
    emailPerIp.consume(clientIp);
    return emailToAddressAllowed(normalizedEmail);
  }

  /**
   * The per-address part alone, for emails that registration triggers. Without it, sign-ups from
   * many IPs could flood someone's inbox with "already registered" notices.
   */
  boolean emailToAddressAllowed(String normalizedEmail) {
    try {
      emailPerAddress.consume(normalizedEmail);
      return true;
    } catch (RateLimitedException e) {
      return false;
    }
  }
}
