package com.securevault.auth;

import com.securevault.account.AccountCredentials;
import com.securevault.account.UserService;
import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.common.security.UserSessions;
import com.securevault.mail.Emails;
import com.securevault.vault.VaultDtos.VaultKeyMaterial;
import com.securevault.vault.VaultService;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Registration, email verification, and account password reset.
 *
 * <p>Every public method that takes an email answers the same way whether or not the account
 * exists, and does comparable work in both cases. Email goes out in the background, so how long a
 * response takes does not depend on whether a message was sent.
 */
@Service
class RegistrationService {

  private final UserService users;
  private final VaultService vaults;
  private final OneTimeTokenService tokens;
  private final PasswordEncoder passwordEncoder;
  private final Emails emails;
  private final UserSessions sessions;
  private final ActivityService activity;
  private final AuthRateLimits rateLimits;
  private final TransactionTemplate transaction;

  RegistrationService(
      UserService users,
      VaultService vaults,
      OneTimeTokenService tokens,
      PasswordEncoder passwordEncoder,
      Emails emails,
      UserSessions sessions,
      ActivityService activity,
      AuthRateLimits rateLimits,
      TransactionTemplate transaction) {
    this.users = users;
    this.vaults = vaults;
    this.tokens = tokens;
    this.passwordEncoder = passwordEncoder;
    this.emails = emails;
    this.sessions = sessions;
    this.activity = activity;
    this.rateLimits = rateLimits;
    this.transaction = transaction;
  }

  /**
   * Creates the account and its vault together, so there is never an account without a vault. An
   * address that is already registered gets a notice instead, and the caller sees no difference.
   */
  void register(String email, String accountPassword, VaultKeyMaterial vault, String clientIp) {
    rateLimits.register(clientIp);
    String normalizedEmail = UserService.normalizeEmail(email);
    // Hashing first means both paths spend the same Argon2 time.
    String passwordHash = passwordEncoder.encode(accountPassword);

    if (users.findCredentials(normalizedEmail).isPresent()) {
      if (rateLimits.emailToAddressAllowed(normalizedEmail)) {
        emails.alreadyRegistered(normalizedEmail);
      }
      return;
    }
    String token;
    try {
      token =
          transaction.execute(status -> {
            UUID userId = users.createUnverified(normalizedEmail, passwordHash);
            vaults.create(userId, vault);
            return tokens.issue(userId, TokenPurpose.EMAIL_VERIFICATION);
          });
    } catch (DataIntegrityViolationException e) {
      // Another request registered the same address a moment earlier.
      if (rateLimits.emailToAddressAllowed(normalizedEmail)) {
        emails.alreadyRegistered(normalizedEmail);
      }
      return;
    }
    emails.verifyEmail(normalizedEmail, token);
  }

  void verifyEmail(String token, String clientIp) {
    rateLimits.tokenSubmission(clientIp);
    UUID userId =
        transaction.execute(status ->
            tokens
                .consume(token, TokenPurpose.EMAIL_VERIFICATION)
                .map(id -> {
                  users.markVerified(id);
                  return id;
                })
                .orElse(null));
    if (userId == null) {
      throw new ApiException(ErrorCode.INVALID_TOKEN);
    }
  }

  void resendVerification(String email, String clientIp) {
    String normalizedEmail = UserService.normalizeEmail(email);
    if (!rateLimits.emailRequest(clientIp, normalizedEmail)) {
      return;
    }
    Optional<AccountCredentials> account = users.findCredentials(normalizedEmail);
    if (account.isPresent() && !account.get().emailVerified()) {
      String token =
          transaction.execute(
              status -> tokens.issue(account.get().id(), TokenPurpose.EMAIL_VERIFICATION));
      emails.verifyEmail(normalizedEmail, token);
    }
  }

  void forgotPassword(String email, String clientIp) {
    String normalizedEmail = UserService.normalizeEmail(email);
    if (!rateLimits.emailRequest(clientIp, normalizedEmail)) {
      return;
    }
    Optional<AccountCredentials> account = users.findCredentials(normalizedEmail);
    if (account.isPresent() && account.get().emailVerified()) {
      String token =
          transaction.execute(
              status -> tokens.issue(account.get().id(), TokenPurpose.PASSWORD_RESET));
      emails.resetPassword(normalizedEmail, token);
    }
  }

  /**
   * Sets a new account password and ends every session. The vault is untouched: its key is wrapped
   * by the master password, which this flow neither knows nor changes.
   */
  void resetPassword(String token, String newAccountPassword, String clientIp) {
    rateLimits.tokenSubmission(clientIp);
    String passwordHash = passwordEncoder.encode(newAccountPassword);
    UUID userId =
        transaction.execute(status ->
            tokens
                .consume(token, TokenPurpose.PASSWORD_RESET)
                .map(id -> {
                  users.changePasswordHash(id, passwordHash);
                  activity.record(id, ActivityType.ACCOUNT_PASSWORD_RESET);
                  return id;
                })
                .orElse(null));
    if (userId == null) {
      throw new ApiException(ErrorCode.INVALID_TOKEN);
    }
    sessions.revokeAll(userId);
    users.findCredentials(userId).ifPresent(a -> emails.passwordWasReset(a.email()));
  }
}
