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

  private final AuthService authService;
  private final UserService users;
  private final SessionEstablisher sessions;
  private final SecurityProperties properties;

  AuthController(
      AuthService authService,
      UserService users,
      SessionEstablisher sessions,
      SecurityProperties properties) {
    this.authService = authService;
    this.users = users;
    this.sessions = sessions;
    this.properties = properties;
  }

  /**
   * The token is XOR-masked with fresh randomness on every call (BREACH protection) and held in
   * memory by the client. A visitor who is not signed in gets a short-lived session to hold it.
   */
  @GetMapping("/csrf")
  CsrfResponse csrf(CsrfToken token, HttpServletRequest request) {
    CsrfResponse response = new CsrfResponse(token.getHeaderName(), token.getToken());
    HttpSession session = request.getSession(false);
    if (session != null && request.getUserPrincipal() == null) {
      session.setMaxInactiveInterval((int) properties.anonymousSessionTimeout().toSeconds());
    }
    return response;
  }

  @PostMapping("/login")
  UserView login(
      @Valid @RequestBody LoginRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    // With nginx in front, Tomcat sets this from the X-Forwarded-For header that nginx overwrites.
    UUID userId = authService.login(body.email(), body.accountPassword(), request.getRemoteAddr());
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

  private UserView currentUser(UUID userId) {
    // A session whose account was deleted is treated as no session at all.
    return users.findView(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
  }
}
