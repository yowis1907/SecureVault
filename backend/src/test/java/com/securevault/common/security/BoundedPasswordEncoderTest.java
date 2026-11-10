package com.securevault.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.securevault.common.ratelimit.RateLimitedException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class BoundedPasswordEncoderTest {

  /** Holds every call until released, so the test controls how many run at once. */
  static final class BlockingEncoder implements PasswordEncoder {
    final CountDownLatch entered = new CountDownLatch(1);
    final CountDownLatch release = new CountDownLatch(1);

    @Override
    public String encode(CharSequence raw) {
      entered.countDown();
      try {
        release.await(10, TimeUnit.SECONDS);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
      return "hash";
    }

    @Override
    public boolean matches(CharSequence raw, String encoded) {
      encode(raw);
      return true;
    }
  }

  @Test
  void rejectsWithRateLimitWhenAllSlotsStayBusy() throws Exception {
    BlockingEncoder blocking = new BlockingEncoder();
    BoundedPasswordEncoder encoder =
        new BoundedPasswordEncoder(blocking, 1, Duration.ofMillis(100));

    CompletableFuture<String> first = CompletableFuture.supplyAsync(() -> encoder.encode("a"));
    assertThat(blocking.entered.await(5, TimeUnit.SECONDS)).isTrue();

    assertThatThrownBy(() -> encoder.matches("b", "hash")).isInstanceOf(RateLimitedException.class);

    blocking.release.countDown();
    assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo("hash");
  }

  @Test
  void releasesTheSlotSoLaterCallsSucceed() {
    BlockingEncoder blocking = new BlockingEncoder();
    blocking.release.countDown();
    BoundedPasswordEncoder encoder =
        new BoundedPasswordEncoder(blocking, 1, Duration.ofMillis(100));
    for (int i = 0; i < 5; i++) {
      assertThat(encoder.matches("a", "hash")).isTrue();
    }
  }

  @Test
  void rejectsANonPositiveBound() {
    assertThatThrownBy(() -> new BoundedPasswordEncoder(new BlockingEncoder(), 0))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
