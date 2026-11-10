package com.securevault.common.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;

/**
 * Stops anonymous requests from creating sessions just to hold a CSRF token.
 *
 * <p>Spring's CSRF filter generates and saves a token whenever a state-changing request arrives
 * without one, and saving into the HTTP session creates a session row. That let anyone fill the
 * session table with POSTs (threat model scenario 39). Here a new token is stored only when a
 * session already exists or when the client asks for one at the CSRF endpoint.
 *
 * <p>Skipping the save does not weaken protection: a request that had no stored token is rejected
 * either way, because the freshly generated random token cannot match what the client sent.
 */
public class NoNewSessionCsrfTokenRepository implements CsrfTokenRepository {

  private final CsrfTokenRepository delegate;
  private final String tokenEndpoint;

  public NoNewSessionCsrfTokenRepository(CsrfTokenRepository delegate, String tokenEndpoint) {
    this.delegate = delegate;
    this.tokenEndpoint = tokenEndpoint;
  }

  @Override
  public CsrfToken generateToken(HttpServletRequest request) {
    return delegate.generateToken(request);
  }

  @Override
  public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
    boolean mayCreateSession =
        "GET".equals(request.getMethod()) && tokenEndpoint.equals(request.getRequestURI());
    if (token == null || request.getSession(false) != null || mayCreateSession) {
      delegate.saveToken(token, request, response);
    }
  }

  @Override
  public CsrfToken loadToken(HttpServletRequest request) {
    return delegate.loadToken(request);
  }
}
