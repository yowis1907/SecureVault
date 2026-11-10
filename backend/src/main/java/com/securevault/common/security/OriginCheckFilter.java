package com.securevault.common.security;

import com.securevault.common.error.ErrorCode;
import com.securevault.common.error.ProblemResponseWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Defense in depth on top of the CSRF token. State-changing requests are rejected when the browser
 * says they come from another site (Fetch Metadata) or names an origin we do not serve.
 *
 * <p>A missing Origin is allowed through, because non-browser clients omit it. Those requests still
 * need a valid CSRF token tied to the session.
 */
public class OriginCheckFilter extends OncePerRequestFilter {

  private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

  private final Set<String> allowedOrigins;
  private final ProblemResponseWriter problems;

  public OriginCheckFilter(List<String> allowedOrigins, ProblemResponseWriter problems) {
    this.allowedOrigins = Set.copyOf(allowedOrigins);
    this.problems = problems;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (!SAFE_METHODS.contains(request.getMethod()) && isCrossOrigin(request)) {
      problems.write(response, ErrorCode.CSRF_REJECTED);
      return;
    }
    chain.doFilter(request, response);
  }

  private boolean isCrossOrigin(HttpServletRequest request) {
    if ("cross-site".equalsIgnoreCase(request.getHeader("Sec-Fetch-Site"))) {
      return true;
    }
    String origin = request.getHeader("Origin");
    return origin != null && !allowedOrigins.contains(origin);
  }
}
