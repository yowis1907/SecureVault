package com.securevault.account;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Maps the `users` table from V1. Never returned from the API; see {@link UserView}. */
@Entity
@Table(name = "users")
class User {

  @Id private UUID id;
  private String email;
  private String passwordHash;
  private Instant emailVerifiedAt;
  private Instant passwordChangedAt;
  private Instant createdAt;
  private Instant updatedAt;

  protected User() {}

  User(UUID id, String email, String passwordHash, Instant now) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.passwordChangedAt = now;
    this.createdAt = now;
    this.updatedAt = now;
  }

  void markVerified(Instant now) {
    if (emailVerifiedAt == null) {
      emailVerifiedAt = now;
      updatedAt = now;
    }
  }

  void changePassword(String newHash, Instant now) {
    passwordHash = newHash;
    passwordChangedAt = now;
    updatedAt = now;
  }

  UUID getId() {
    return id;
  }

  String getEmail() {
    return email;
  }

  String getPasswordHash() {
    return passwordHash;
  }

  Instant getEmailVerifiedAt() {
    return emailVerifiedAt;
  }

  Instant getCreatedAt() {
    return createdAt;
  }
}
