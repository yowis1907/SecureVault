package com.securevault.account;

import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.common.ratelimit.RateLimitRule;
import com.securevault.common.ratelimit.RateLimiter;
import java.time.Duration;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Asks for the account password again before destructive or key-changing actions, so a hijacked
 * session alone cannot reset the vault or delete the account. Limited to 5 tries per 15 minutes.
 */
@Service
public class StepUpService {

  private final UserService users;
  private final PasswordEncoder passwordEncoder;
  private final RateLimiter limiter =
      new RateLimiter(new RateLimitRule("step-up", 5, Duration.ofMinutes(15)));

  public StepUpService(UserService users, PasswordEncoder passwordEncoder) {
    this.users = users;
    this.passwordEncoder = passwordEncoder;
  }

  public void verify(UUID userId, String accountPassword) {
    limiter.consume(userId.toString());
    AccountCredentials account =
        users
            .findCredentials(userId)
            .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHENTICATED));
    if (!passwordEncoder.matches(accountPassword, account.passwordHash())) {
      throw new ApiException(ErrorCode.STEP_UP_FAILED);
    }
  }
}
