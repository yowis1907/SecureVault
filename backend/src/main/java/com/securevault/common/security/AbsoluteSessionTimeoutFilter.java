package com.securevault.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Spring Session only expires idle sessions, so a session used every few minutes could live
 * forever. This ends any session older than the absolute limit, measured from login.
 *
 * <p>It runs before anything reads the security context, so the invalidated session is never loaded
 * and the request continues as anonymous.
 */
public class AbsoluteSessionTimeoutFilter extends OncePerRequestFilter {

  /** Login time in epoch milliseconds, set by {@link SessionEstablisher}. */
  static final String AUTHENTICATED_AT = "securevault.authenticatedAt";

  private final Clock clock;
  private final Duration maxAge;

  public AbsoluteSessionTimeoutFilter(Clock clock, Duration maxAge) {
    this.clock = clock;
    this.maxAge = maxAge;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    HttpSession session = request.getSession(false);
    if (session != null
        && session.getAttribute(AUTHENTICATED_AT) instanceof Long authenticatedAt
        && clock.millis() - authenticatedAt > maxAge.toMillis()) {
      session.invalidate();
      SecurityContextHolder.clearContext();
    }
    chain.doFilter(request, response);
  }
}
