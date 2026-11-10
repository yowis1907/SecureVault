package com.securevault.common.security;

import com.securevault.common.error.ErrorCode;
import com.securevault.common.error.ProblemResponseWriter;
import jakarta.servlet.DispatcherType;
import java.time.Clock;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.DelegatingSecurityContextRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

/**
 * Closed by default: only health, the CSRF token, and login are public, everything else under
 * /api/v1 needs a session, and any other path is denied. Login is handled by AuthController and
 * SessionEstablisher rather than a form login, because the API speaks JSON.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

  static final String CSRF_ENDPOINT = "/api/v1/auth/csrf";
  static final String[] PUBLIC_POST_ENDPOINTS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/verification/resend",
    "/api/v1/auth/password/forgot",
    "/api/v1/auth/password/reset"
  };

  /**
   * Argon2id with 19 MiB, 2 passes, 1 lane, 16-byte salt, 32-byte hash: the OWASP minimum. Set
   * explicitly because Spring's default uses 16 MiB, which is below it.
   */
  @Bean
  PasswordEncoder passwordEncoder(SecurityProperties properties) {
    return new BoundedPasswordEncoder(
        new Argon2PasswordEncoder(16, 32, 1, 19456, 2), properties.maxConcurrentPasswordHashes());
  }

  /**
   * Defined here rather than through server.servlet.session.cookie, which Boot applies only when it
   * runs an embedded server. That left tests running with Spring Session's default cookie, which
   * has a different name and lacks SameSite=Strict. One explicit bean means tests check the cookie
   * production sends.
   */
  @Bean
  CookieSerializer cookieSerializer(SecurityProperties properties) {
    DefaultCookieSerializer cookie = new DefaultCookieSerializer();
    cookie.setCookieName(properties.sessionCookieName());
    cookie.setUseSecureCookie(properties.sessionCookieSecure());
    cookie.setUseHttpOnlyCookie(true);
    cookie.setSameSite("Strict");
    cookie.setCookiePath("/");
    return cookie;
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new DelegatingSecurityContextRepository(
        new RequestAttributeSecurityContextRepository(),
        new HttpSessionSecurityContextRepository());
  }

  /** Synchronizer token stored in the session, sent by the client in X-XSRF-TOKEN. */
  @Bean
  CsrfTokenRepository csrfTokenRepository() {
    HttpSessionCsrfTokenRepository session = new HttpSessionCsrfTokenRepository();
    session.setHeaderName("X-XSRF-TOKEN");
    return new NoNewSessionCsrfTokenRepository(session, CSRF_ENDPOINT);
  }

  @Bean
  SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrfTokens) {
    return new CompositeSessionAuthenticationStrategy(
        List.of(
            new ChangeSessionIdAuthenticationStrategy(),
            new CsrfAuthenticationStrategy(csrfTokens)));
  }

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      CsrfTokenRepository csrfTokens,
      SecurityContextRepository contexts,
      ProblemResponseWriter problems,
      SecurityProperties properties,
      Clock clock)
      throws Exception {
    return http.authorizeHttpRequests(requests ->
            requests
                // Lets Spring's error page render instead of being blocked itself.
                .dispatcherTypeMatchers(DispatcherType.ERROR)
                .permitAll()
                .requestMatchers("/actuator/health", "/actuator/health/**")
                .permitAll()
                .requestMatchers(HttpMethod.GET, CSRF_ENDPOINT)
                .permitAll()
                .requestMatchers(HttpMethod.POST, PUBLIC_POST_ENDPOINTS)
                .permitAll()
                .requestMatchers("/api/v1/**")
                .authenticated()
                .anyRequest()
                .denyAll())
        .csrf(csrf -> csrf.csrfTokenRepository(csrfTokens))
        .securityContext(context -> context.securityContextRepository(contexts))
        .exceptionHandling(errors ->
            errors
                .authenticationEntryPoint(
                    (request, response, e) -> problems.write(response, ErrorCode.UNAUTHENTICATED))
                .accessDeniedHandler((request, response, e) ->
                    problems.write(
                        response,
                        e instanceof CsrfException
                            ? ErrorCode.CSRF_REJECTED
                            : ErrorCode.FORBIDDEN)))
        // First of all, so no oversized body is read by anything after it.
        .addFilterBefore(new RequestSizeLimitFilter(problems), SecurityContextHolderFilter.class)
        .addFilterBefore(
            new OriginCheckFilter(properties.allowedOrigins(), problems), CsrfFilter.class)
        .addFilterAfter(
            new AbsoluteSessionTimeoutFilter(clock, properties.absoluteSessionTimeout()),
            SecurityContextHolderFilter.class)
        .addFilterAfter(new UserRateLimitFilter(problems), AuthorizationFilter.class)
        // A JSON API has no login page to return to. Left on, this stores a new session for every
        // denied anonymous request.
        .requestCache(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .build();
  }
}
