package com.securevault.common.security;

import com.securevault.common.error.ErrorCode;
import com.securevault.common.error.ProblemResponseWriter;
import com.securevault.common.ratelimit.RateLimitRule;
import com.securevault.common.ratelimit.RateLimitedException;
import com.securevault.common.ratelimit.RateLimiter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** 300 requests per minute per signed-in user, keyed by user ID rather than IP. */
public class UserRateLimitFilter extends OncePerRequestFilter {

  private final RateLimiter limiter =
      new RateLimiter(new RateLimitRule("api-user", 300, Duration.ofMinutes(1)));
  private final ProblemResponseWriter problems;

  public UserRateLimitFilter(ProblemResponseWriter problems) {
    this.problems = problems;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication instanceof UsernamePasswordAuthenticationToken signedIn) {
      try {
        limiter.consume(signedIn.getName());
      } catch (RateLimitedException e) {
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(e.retryAfterSeconds()));
        problems.write(response, ErrorCode.RATE_LIMITED);
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
