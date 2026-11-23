package com.securevault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.securevault.account.AccountCredentials;
import com.securevault.account.UserService;
import com.securevault.activity.ActivityService;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.mfa.MfaService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

/** The database and hashing are mocked here; AuthIT covers the real ones. */
class AuthServiceTest {

  private final UserService users = mock(UserService.class);
  private final PasswordEncoder encoder = mock(PasswordEncoder.class);
  private AuthService service;

  @BeforeEach
  void setUp() {
    when(encoder.encode(anyString())).thenReturn("dummy-hash");
    service =
        new AuthService(
            users,
            encoder,
            new AuthRateLimits(),
            mock(ActivityService.class),
            mock(MfaService.class));
  }

  @Test
  void unknownEmailStillRunsAPasswordHashSoTimingMatches() {
    when(users.findCredentials("nobody@example.test")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.login("nobody@example.test", "pw", "192.0.2.1"))
        .isInstanceOfSatisfying(
            ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.INVALID_CREDENTIALS));
    verify(encoder).matches("pw", "dummy-hash");
  }

  @Test
  void looksUpTheNormalizedEmail() {
    UUID id = UUID.randomUUID();
    when(users.findCredentials("user@example.test"))
        .thenReturn(
            Optional.of(new AccountCredentials(id, "user@example.test", "real-hash", true)));
    when(encoder.matches(eq("pw"), eq("real-hash"))).thenReturn(true);

    assertThat(service.login("  USER@Example.TEST ", "pw", "192.0.2.2"))
        .isEqualTo(new AuthService.PasswordCheck(id, false));
  }
}
