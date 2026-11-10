package com.securevault.common.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

  private final RateLimiter limiter =
      new RateLimiter(new RateLimitRule("test", 3, Duration.ofMinutes(1)));

  @Test
  void allowsTheCapacityThenRejectsWithARetryTime() {
    for (int i = 0; i < 3; i++) {
      limiter.consume("key");
    }
    assertThatThrownBy(() -> limiter.consume("key"))
        .isInstanceOfSatisfying(
            RateLimitedException.class, e -> assertThat(e.retryAfterSeconds()).isBetween(1L, 21L));
  }

  @Test
  void keysAreIndependent() {
    for (int i = 0; i < 3; i++) {
      limiter.consume("a");
    }
    limiter.consume("b");
  }
}
