package com.securevault.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * The upper bound on the password keeps hashing cost predictable. There is no lower bound here:
 * login only answers right or wrong, while the 12-character rule applies when a password is set.
 */
public record LoginRequest(
    @NotBlank @Size(max = 254) String email, @NotEmpty @Size(max = 128) String accountPassword) {

  /** Keeps the password out of logs and debugger views if this object is ever printed. */
  @Override
  public String toString() {
    return "LoginRequest[email=<redacted>, accountPassword=<redacted>]";
  }
}
