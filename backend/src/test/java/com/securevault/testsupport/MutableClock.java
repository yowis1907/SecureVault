package com.securevault.testsupport;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

/** A clock tests move forward instead of sleeping. It only ever moves forward. */
public final class MutableClock extends Clock {

  private final AtomicReference<Instant> now = new AtomicReference<>(Instant.now());

  public void advance(Duration duration) {
    now.updateAndGet(i -> i.plus(duration));
  }

  @Override
  public Instant instant() {
    return now.get();
  }

  @Override
  public ZoneId getZone() {
    return ZoneOffset.UTC;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return this;
  }
}
