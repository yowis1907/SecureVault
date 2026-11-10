package com.securevault.maintenance;

import com.securevault.account.UserService;
import com.securevault.activity.ActivityService;
import com.securevault.auth.TokenCleanup;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retention rules from DATABASE_DESIGN: unverified accounts after 24 hours, finished tokens after 7
 * days, activity after 90 days. Expired sessions are removed by Spring Session's own job.
 */
@Component
public class PurgeJobs {

  private static final Logger log = LoggerFactory.getLogger(PurgeJobs.class);

  private final UserService users;
  private final TokenCleanup tokens;
  private final ActivityService activity;
  private final Clock clock;

  PurgeJobs(UserService users, TokenCleanup tokens, ActivityService activity, Clock clock) {
    this.users = users;
    this.tokens = tokens;
    this.activity = activity;
    this.clock = clock;
  }

  @Scheduled(cron = "0 7 * * * *")
  public void runAll() {
    Instant now = clock.instant();
    int accounts = users.deleteUnverifiedCreatedBefore(now.minus(Duration.ofHours(24)));
    int tokenRows = tokens.deleteFinishedBefore(now.minus(Duration.ofDays(7)));
    int events = activity.deleteOlderThan(now.minus(Duration.ofDays(90)));
    log.info(
        "Purge finished: unverified accounts={} tokens={} activity events={}",
        accounts,
        tokenRows,
        events);
  }
}
