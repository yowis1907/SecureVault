package com.securevault.account;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

  private final UserRepository users;

  public UserService(UserRepository users) {
    this.users = users;
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
    return users
        .findByEmail(normalizedEmail)
        .map(u ->
            new AccountCredentials(u.getId(), u.getPasswordHash(), u.getEmailVerifiedAt() != null));
  }

  @Transactional(readOnly = true)
  public Optional<UserView> findView(UUID id) {
    return users.findById(id).map(u -> new UserView(u.getId(), u.getEmail(), u.getCreatedAt()));
  }
}
