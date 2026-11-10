package com.securevault.account;

import java.util.UUID;

/** What login, step-up, and email flows need. Kept out of any response. */
public record AccountCredentials(
    UUID id, String email, String passwordHash, boolean emailVerified) {

  /** Keeps the hash and address out of logs if this object is ever printed. */
  @Override
  public String toString() {
    return "AccountCredentials[id=" + id + ", emailVerified=" + emailVerified + "]";
  }
}
