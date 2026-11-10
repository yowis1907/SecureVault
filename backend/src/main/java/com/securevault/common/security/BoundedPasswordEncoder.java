package com.securevault.common.security;

import com.securevault.common.ratelimit.RateLimitedException;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Each Argon2 hash allocates about 19 MiB. Without a bound, a flood of login requests could exhaust
 * the heap. Callers wait briefly for a slot, then get a 429 instead of piling up.
 */
public class BoundedPasswordEncoder implements PasswordEncoder {

  private final PasswordEncoder delegate;
  private final Semaphore permits;
  private final Duration maxWait;

  public BoundedPasswordEncoder(PasswordEncoder delegate, int maxConcurrent) {
    this(delegate, maxConcurrent, Duration.ofSeconds(10));
  }

  BoundedPasswordEncoder(PasswordEncoder delegate, int maxConcurrent, Duration maxWait) {
    if (maxConcurrent < 1) {
      throw new IllegalArgumentException("maxConcurrent must be at least 1");
    }
    this.delegate = delegate;
    this.permits = new Semaphore(maxConcurrent, true);
    this.maxWait = maxWait;
  }

  @Override
  public String encode(CharSequence rawPassword) {
    acquire();
    try {
      return delegate.encode(rawPassword);
    } finally {
      permits.release();
    }
  }

  @Override
  public boolean matches(CharSequence rawPassword, String encodedPassword) {
    acquire();
    try {
      return delegate.matches(rawPassword, encodedPassword);
    } finally {
      permits.release();
    }
  }

  private void acquire() {
    try {
      if (!permits.tryAcquire(maxWait.toMillis(), TimeUnit.MILLISECONDS)) {
        throw new RateLimitedException(maxWait.toSeconds());
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RateLimitedException(maxWait.toSeconds());
    }
  }
}
