package com.securevault.common.ratelimit;

import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;

/** Answered with 429 and a Retry-After header. */
public class RateLimitedException extends ApiException {

  private final long retryAfterSeconds;

  public RateLimitedException(long retryAfterSeconds) {
    super(ErrorCode.RATE_LIMITED);
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }

  public long retryAfterSeconds() {
    return retryAfterSeconds;
  }
}
