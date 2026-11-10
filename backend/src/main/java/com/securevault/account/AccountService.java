package com.securevault.account;

import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.common.security.UserSessions;
import com.securevault.common.security.UserSessions.SessionInfo;
import java.util.List;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

  private final UserService users;
  private final StepUpService stepUp;
  private final PasswordEncoder passwordEncoder;
  private final UserSessions sessions;
  private final ActivityService activity;

  public AccountService(
      UserService users,
      StepUpService stepUp,
      PasswordEncoder passwordEncoder,
      UserSessions sessions,
      ActivityService activity) {
    this.users = users;
    this.stepUp = stepUp;
    this.passwordEncoder = passwordEncoder;
    this.sessions = sessions;
    this.activity = activity;
  }

  /** The caller rotates its own session ID; every other session of this user ends here. */
  @Transactional
  public void changePassword(
      UUID userId, String currentPassword, String newPassword, String currentSessionId) {
    stepUp.verify(userId, currentPassword);
    users.changePasswordHash(userId, passwordEncoder.encode(newPassword));
    sessions.revokeAllExcept(userId, currentSessionId);
    activity.record(userId, ActivityType.ACCOUNT_PASSWORD_CHANGED);
  }

  public List<SessionInfo> sessions(UUID userId, String currentSessionId) {
    return sessions.list(userId, currentSessionId);
  }

  @Transactional
  public void revokeSession(UUID userId, String handle) {
    if (!sessions.revoke(userId, handle)) {
      throw new ApiException(ErrorCode.NOT_FOUND);
    }
    activity.record(userId, ActivityType.SESSION_REVOKED);
  }

  @Transactional
  public void revokeOtherSessions(UUID userId, String currentSessionId) {
    sessions.revokeAllExcept(userId, currentSessionId);
    activity.record(userId, ActivityType.SESSION_REVOKED);
  }

  /** Removes every row the user owns, then all of their sessions. */
  @Transactional
  public void deleteAccount(UUID userId, String accountPassword) {
    stepUp.verify(userId, accountPassword);
    users.delete(userId);
    sessions.revokeAll(userId);
  }
}
