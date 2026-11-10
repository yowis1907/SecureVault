package com.securevault.auth;

import java.time.Instant;
import org.springframework.stereotype.Component;

/** The one token operation other packages may call; issuing and consuming stay in auth. */
@Component
public class TokenCleanup {

  private final OneTimeTokenService tokens;

  TokenCleanup(OneTimeTokenService tokens) {
    this.tokens = tokens;
  }

  public int deleteFinishedBefore(Instant cutoff) {
    return tokens.deleteFinishedBefore(cutoff);
  }
}
