package com.securevault.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Turns a verified login into a session, and ends it again at logout.
 *
 * <p>The principal name is the user's UUID, so Spring Session indexes sessions by ID and email
 * addresses never reach the session table.
 */
@Component
public class SessionEstablisher {

  private final SecurityContextHolderStrategy contexts =
      SecurityContextHolder.getContextHolderStrategy();
  private final SecurityContextRepository repository;
  private final SessionAuthenticationStrategy sessionStrategy;
  private final Clock clock;
  private final Duration idleTimeout;

  public SessionEstablisher(
      SecurityContextRepository repository,
      SessionAuthenticationStrategy sessionStrategy,
      Clock clock,
      @Value("${server.servlet.session.timeout}") Duration idleTimeout) {
    this.repository = repository;
    this.sessionStrategy = sessionStrategy;
    this.clock = clock;
    this.idleTimeout = idleTimeout;
  }

  public void establish(UUID userId, HttpServletRequest request, HttpServletResponse response) {
    Authentication authentication =
        UsernamePasswordAuthenticationToken.authenticated(
            userId.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_USER")));

    // New session ID, which defeats session fixation, and a new CSRF token.
    sessionStrategy.onAuthentication(authentication, request, response);

    SecurityContext context = contexts.createEmptyContext();
    context.setAuthentication(authentication);
    contexts.setContext(context);
    repository.saveContext(context, request, response);

    HttpSession session = request.getSession();
    session.setAttribute(AbsoluteSessionTimeoutFilter.AUTHENTICATED_AT, clock.millis());
    // The pre-login session had a short lifetime. A signed-in session gets the normal idle timeout.
    session.setMaxInactiveInterval((int) idleTimeout.toSeconds());
  }

  public void end(HttpServletRequest request, HttpServletResponse response) {
    new SecurityContextLogoutHandler().logout(request, response, null);
  }
}
