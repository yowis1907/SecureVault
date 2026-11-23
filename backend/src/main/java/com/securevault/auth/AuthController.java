package com.securevault.auth;

import com.securevault.account.UserService;
import com.securevault.account.UserView;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.common.security.SecurityProperties;
import com.securevault.common.security.SessionEstablisher;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

  /** Sent instead of the user when a code from the authenticator app must follow. */
  record MfaChallenge(boolean mfaRequired) {}

  record MfaCodeRequest(@NotNull @Size(min = 6, max = 32) String code) {
    @Override
    public String toString() {
      return "MfaCodeRequest[<redacted>]";
    }
  }

  // The half-finished sign-in lives in the not-yet-authenticated session, never in the client.
  static final String PENDING_USER = "securevault.mfa.user";
  static final String PENDING_SINCE = "securevault.mfa.since";
  static final String PENDING_FAILURES = "securevault.mfa.failures";

  /** Time allowed between the password and the code. */
  static final Duration PENDING_LIFETIME = Duration.ofMinutes(5);

  /** Wrong codes allowed before the password has to be entered again. */
  static final int PENDING_MAX_FAILURES = 5;

  private final AuthService authService;
  private final UserService users;
  private final SessionEstablisher sessions;
  private final SecurityProperties properties;
  private final AuthRateLimits rateLimits;
  private final Clock clock;

  AuthController(
      AuthService authService,
      UserService users,
      SessionEstablisher sessions,
      SecurityProperties properties,
      AuthRateLimits rateLimits,
      Clock clock) {
    this.authService = authService;
    this.users = users;
    this.sessions = sessions;
    this.properties = properties;
    this.rateLimits = rateLimits;
    this.clock = clock;
  }

  /**
   * The token is XOR-masked with fresh randomness on every call (BREACH protection) and held in
   * memory by the client. A visitor who is not signed in gets a short-lived session to hold it.
   */
  @GetMapping("/csrf")
  CsrfResponse csrf(CsrfToken token, HttpServletRequest request) {
    rateLimits.csrf(request.getRemoteAddr());
    CsrfResponse response = new CsrfResponse(token.getHeaderName(), token.getToken());
    HttpSession session = request.getSession(false);
    if (session != null && request.getUserPrincipal() == null) {
      session.setMaxInactiveInterval((int) properties.anonymousSessionTimeout().toSeconds());
    }
    return response;
  }

  /**
   * Returns the user, or {@code {"mfaRequired": true}} when two-factor sign-in is on. In that case
   * no session is established yet: the code goes to {@code /login/mfa}.
   */
  @PostMapping("/login")
  ResponseEntity<?> login(
      @Valid @RequestBody LoginRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    // With nginx in front, Tomcat sets this from the X-Forwarded-For header that nginx overwrites.
    AuthService.PasswordCheck check =
        authService.login(body.email(), body.accountPassword(), request.getRemoteAddr());
    if (check.mfaRequired()) {
      // A new session ID, so an ID fixed before the password was entered cannot carry the state.
      request.getSession();
      request.changeSessionId();
      HttpSession session = request.getSession();
      session.setAttribute(PENDING_USER, check.userId().toString());
      session.setAttribute(PENDING_SINCE, clock.millis());
      session.setAttribute(PENDING_FAILURES, 0);
      return ResponseEntity.ok(new MfaChallenge(true));
    }
    sessions.establish(check.userId(), request, response);
    return ResponseEntity.ok(currentUser(check.userId()));
  }

  /** The second step: a code from the authenticator app, or a recovery code. */
  @PostMapping("/login/mfa")
  UserView loginMfa(
      @Valid @RequestBody MfaCodeRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    rateLimits.mfa(request.getRemoteAddr());
    HttpSession session = request.getSession(false);
    UUID userId = pendingUser(session);
    try {
      authService.completeMfa(userId, body.code());
    } catch (ApiException e) {
      int failures = (Integer) session.getAttribute(PENDING_FAILURES) + 1;
      if (failures >= PENDING_MAX_FAILURES) {
        clearPending(session);
      } else {
        session.setAttribute(PENDING_FAILURES, failures);
      }
      throw e;
    }
    clearPending(session);
    sessions.establish(userId, request, response);
    return currentUser(userId);
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
    sessions.end(request, response);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/me")
  UserView me(Authentication authentication) {
    return currentUser(UUID.fromString(authentication.getName()));
  }

  private UUID pendingUser(HttpSession session) {
    if (session == null
        || !(session.getAttribute(PENDING_USER) instanceof String user)
        || !(session.getAttribute(PENDING_SINCE) instanceof Long since)) {
      throw new ApiException(ErrorCode.MFA_CHALLENGE_EXPIRED);
    }
    if (clock.millis() - since > PENDING_LIFETIME.toMillis()) {
      clearPending(session);
      throw new ApiException(ErrorCode.MFA_CHALLENGE_EXPIRED);
    }
    return UUID.fromString(user);
  }

  private static void clearPending(HttpSession session) {
    session.removeAttribute(PENDING_USER);
    session.removeAttribute(PENDING_SINCE);
    session.removeAttribute(PENDING_FAILURES);
  }

  private UserView currentUser(UUID userId) {
    // A session whose account was deleted is treated as no session at all.
    return users.findView(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
  }
}
