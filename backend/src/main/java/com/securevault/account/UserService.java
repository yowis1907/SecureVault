package com.securevault.account;

import com.securevault.common.config.Db;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

  private final UserRepository users;
  private final JdbcClient jdbc;
  private final Clock clock;

  public UserService(UserRepository users, JdbcClient jdbc, Clock clock) {
    this.users = users;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  /**
   * Trims and lowercases with a fixed locale. Plain toLowerCase() on a Turkish-locale machine turns
   * "I" into a dotless "ı", which would make the same address look different.
   */
  public static String normalizeEmail(String email) {
    return email.strip().toLowerCase(Locale.ROOT);
  }

  @Transactional(readOnly = true)
  public Optional<AccountCredentials> findCredentials(String normalizedEmail) {
    return users.findByEmail(normalizedEmail).map(UserService::credentials);
  }

  @Transactional(readOnly = true)
  public Optional<AccountCredentials> findCredentials(UUID id) {
    return users.findById(id).map(UserService::credentials);
  }

  @Transactional(readOnly = true)
  public Optional<UserView> findView(UUID id) {
    return users.findById(id).map(u -> new UserView(u.getId(), u.getEmail(), u.getCreatedAt()));
  }

  /** Inserts and flushes, so a duplicate email fails here rather than at commit. */
  @Transactional
  public UUID createUnverified(String normalizedEmail, String passwordHash) {
    User user = new User(UUID.randomUUID(), normalizedEmail, passwordHash, clock.instant());
    users.saveAndFlush(user);
    return user.getId();
  }

  @Transactional
  public void markVerified(UUID id) {
    users.findById(id).ifPresent(u -> u.markVerified(clock.instant()));
  }

  @Transactional
  public void changePasswordHash(UUID id, String passwordHash) {
    users.findById(id).ifPresent(u -> u.changePassword(passwordHash, clock.instant()));
  }

  /** Cascades to the vault, records, tokens, and activity through foreign keys. */
  @Transactional
  public void delete(UUID id) {
    users.deleteById(id);
  }

  /** Lets an address be registered again if its owner never confirmed it. */
  @Transactional
  public int deleteUnverifiedCreatedBefore(Instant cutoff) {
    return jdbc.sql("DELETE FROM users WHERE email_verified_at IS NULL AND created_at < ?")
        .param(Db.ts(cutoff))
        .update();
  }

  private static AccountCredentials credentials(User u) {
    return new AccountCredentials(
        u.getId(), u.getEmail(), u.getPasswordHash(), u.getEmailVerifiedAt() != null);
  }
}
