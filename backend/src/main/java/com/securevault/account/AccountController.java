package com.securevault.account;

import com.securevault.common.security.SessionEstablisher;
import com.securevault.common.security.UserSessions.SessionInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/account")
class AccountController {

  record ChangePasswordRequest(
      @NotEmpty @Size(max = 128) String currentAccountPassword,
      @NotNull @Size(min = 12, max = 128) String newAccountPassword) {
    @Override
    public String toString() {
      return "ChangePasswordRequest[<redacted>]";
    }
  }

  record DeleteAccountRequest(
      @NotEmpty @Size(max = 128) String accountPassword,
      @NotNull @Pattern(regexp = "DELETE MY ACCOUNT") String confirmation) {
    @Override
    public String toString() {
      return "DeleteAccountRequest[<redacted>]";
    }
  }

  record SessionsResponse(List<SessionInfo> sessions) {}

  private final AccountService accounts;
  private final SessionEstablisher sessionEstablisher;

  AccountController(AccountService accounts, SessionEstablisher sessionEstablisher) {
    this.accounts = accounts;
    this.sessionEstablisher = sessionEstablisher;
  }

  @PutMapping("/password")
  ResponseEntity<Void> changePassword(
      Authentication authentication,
      @Valid @RequestBody ChangePasswordRequest body,
      HttpServletRequest request) {
    // Other sessions are ended by ID as the session store currently has it. Rotating first would
    // hand it an ID it has not saved yet, and this session would be deleted with the others.
    accounts.changePassword(
        userId(authentication),
        body.currentAccountPassword(),
        body.newAccountPassword(),
        request.getSession().getId());
    // Then a new ID for this session, so an ID captured before the change is useless.
    request.changeSessionId();
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/sessions")
  SessionsResponse sessions(Authentication authentication, HttpServletRequest request) {
    return new SessionsResponse(
        accounts.sessions(userId(authentication), request.getSession().getId()));
  }

  @DeleteMapping("/sessions/{handle}")
  ResponseEntity<Void> revokeSession(Authentication authentication, @PathVariable String handle) {
    accounts.revokeSession(userId(authentication), handle);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/sessions")
  ResponseEntity<Void> revokeOtherSessions(
      Authentication authentication, HttpServletRequest request) {
    accounts.revokeOtherSessions(userId(authentication), request.getSession().getId());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/deletion")
  ResponseEntity<Void> delete(
      Authentication authentication,
      @Valid @RequestBody DeleteAccountRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    accounts.deleteAccount(userId(authentication), body.accountPassword());
    sessionEstablisher.end(request, response);
    return ResponseEntity.noContent().build();
  }

  private static UUID userId(Authentication authentication) {
    return UUID.fromString(authentication.getName());
  }
}
