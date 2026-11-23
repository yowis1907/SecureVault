package com.securevault.auth;

import com.securevault.account.AccountCredentials;
import com.securevault.account.UserService;
import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.mfa.MfaService;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** Checks account passwords. The master password never reaches this service or the server. */
@Service
class AuthService {

  /** A correct password. If {@code mfaRequired}, a code must follow before a session starts. */
  record PasswordCheck(UUID userId, boolean mfaRequired) {}

  private final UserService users;
  private final PasswordEncoder passwordEncoder;
  private final AuthRateLimits rateLimits;
  private final ActivityService activity;
  private final MfaService mfa;

  /**
   * Hash of a random value nobody knows. An unknown email is checked against it, so the response
   * takes as long as for a real account and timing does not reveal which emails exist.
   */
  private final String dummyHash;

  AuthService(
      UserService users,
      PasswordEncoder passwordEncoder,
      AuthRateLimits rateLimits,
      ActivityService activity,
      MfaService mfa) {
    this.users = users;
    this.mfa = mfa;
    this.passwordEncoder = passwordEncoder;
    this.rateLimits = rateLimits;
    this.activity = activity;
    byte[] random = new byte[32];
    new SecureRandom().nextBytes(random);
    this.dummyHash = passwordEncoder.encode(HexFormat.of().formatHex(random));
  }

  /** Checks the password, or throws with the documented error code. */
  PasswordCheck login(String email, String accountPassword, String clientIp) {
    String normalizedEmail = UserService.normalizeEmail(email);
    rateLimits.login(clientIp, normalizedEmail);

    Optional<AccountCredentials> account = users.findCredentials(normalizedEmail);
    boolean passwordMatches =
        passwordEncoder.matches(
            accountPassword, account.map(AccountCredentials::passwordHash).orElse(dummyHash));
    if (account.isEmpty() || !passwordMatches) {
      throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
    }
    // Revealed only after a correct password, so it does not help enumerate accounts.
    if (!account.get().emailVerified()) {
      throw new ApiException(ErrorCode.EMAIL_NOT_VERIFIED);
    }
    UUID userId = account.get().id();
    // Revealed only after a correct password too, so it says nothing to someone guessing.
    if (mfa.isEnabled(userId)) {
      return new PasswordCheck(userId, true);
    }
    activity.record(userId, ActivityType.LOGIN_SUCCEEDED);
    return new PasswordCheck(userId, false);
  }

  /** The second step of sign-in. Throws INVALID_MFA_CODE unless the code is accepted. */
  void completeMfa(UUID userId, String code) {
    if (mfa.verify(userId, code).isEmpty()) {
      throw new ApiException(ErrorCode.INVALID_MFA_CODE);
    }
    activity.record(userId, ActivityType.LOGIN_SUCCEEDED);
  }
}
