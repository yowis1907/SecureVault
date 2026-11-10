package com.securevault.common.ratelimit;

import java.time.Duration;

/** A limit such as "5 per minute". Tokens refill gradually over the period. */
public record RateLimitRule(String name, long capacity, Duration period) {}
