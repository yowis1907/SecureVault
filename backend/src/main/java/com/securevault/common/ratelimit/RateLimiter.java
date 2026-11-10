package com.securevault.common.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import java.util.concurrent.TimeUnit;

/**
 * In-memory token buckets for one rule, keyed by IP, email, or user. The cache is bounded, so an
 * attacker sending many distinct keys cannot exhaust memory; evicting an idle bucket only resets a
 * limit that had already refilled. Limits are per instance, a documented limitation.
 */
public class RateLimiter {

  private static final long MAX_KEYS = 100_000;

  private final RateLimitRule rule;
  private final Cache<String, Bucket> buckets;

  public RateLimiter(RateLimitRule rule) {
    this.rule = rule;
    this.buckets =
        Caffeine.newBuilder()
            .maximumSize(MAX_KEYS)
            .expireAfterAccess(rule.period().multipliedBy(2))
            .build();
  }

  /** Takes one token, or throws with the time until one is available. */
  public void consume(String key) {
    Bucket bucket = buckets.get(key, k -> newBucket());
    ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
    if (!probe.isConsumed()) {
      long seconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1;
      throw new RateLimitedException(seconds);
    }
  }

  private Bucket newBucket() {
    return Bucket.builder()
        .addLimit(
            limit -> limit.capacity(rule.capacity()).refillGreedy(rule.capacity(), rule.period()))
        .build();
  }
}
