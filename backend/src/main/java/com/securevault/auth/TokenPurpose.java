package com.securevault.auth;

import java.time.Duration;

enum TokenPurpose {
  EMAIL_VERIFICATION(Duration.ofHours(24)),
  PASSWORD_RESET(Duration.ofMinutes(30));

  private final Duration lifetime;

  TokenPurpose(Duration lifetime) {
    this.lifetime = lifetime;
  }

  Duration lifetime() {
    return lifetime;
  }
}
