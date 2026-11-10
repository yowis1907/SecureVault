package com.securevault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import com.securevault.testsupport.IntegrationTest;
import com.securevault.testsupport.MutableClock;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Login, sessions, CSRF, origin checks, and throttling, through the real filter chain on a real
 * PostgreSQL. Each test uses its own simulated browser with its own IP, so rate limits from one
 * test cannot affect another. All passwords are generated test values.
 */
@IntegrationTest
class AuthIT {

  private static final String COOKIE = "SV_SESSION";

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PasswordEncoder passwordEncoder;
  @Autowired private MutableClock clock;

  /** Holds what a browser would: the session cookie, the in-memory CSRF token, and an IP. */
  final class Browser {
    String session;
    String csrf;
    String origin;
    final String ip =
        "10.%d.%d.%d"
            .formatted(
                ThreadLocalRandom.current().nextInt(256),
                ThreadLocalRandom.current().nextInt(256),
                ThreadLocalRandom.current().nextInt(1, 255));

    MockHttpServletResponse send(MockHttpServletRequestBuilder request) throws Exception {
      request.with(r -> {
        r.setRemoteAddr(ip);
        return r;
      });
      if (session != null) {
        request.cookie(new Cookie(COOKIE, session));
      }
      if (csrf != null) {
        request.header("X-XSRF-TOKEN", csrf);
      }
      if (origin != null) {
        request.header("Origin", origin);
      }
      MockHttpServletResponse response = mockMvc.perform(request).andReturn().getResponse();
      for (String header : response.getHeaders("Set-Cookie")) {
        if (header.startsWith(COOKIE + "=")) {
          String value = header.substring(COOKIE.length() + 1, header.indexOf(';'));
          session = value.isEmpty() || header.contains("Max-Age=0") ? null : value;
        }
      }
      return response;
    }

    MockHttpServletResponse fetchCsrf() throws Exception {
      MockHttpServletResponse response = send(get("/api/v1/auth/csrf"));
      csrf = JsonPath.read(response.getContentAsString(), "$.token");
      return response;
    }

    MockHttpServletResponse login(String email, String password) throws Exception {
      return send(
          post("/api/v1/auth/login")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"email\":\"%s\",\"accountPassword\":\"%s\"}".formatted(email, password)));
    }

    MockHttpServletResponse me() throws Exception {
      return send(get("/api/v1/auth/me"));
    }

    MockHttpServletResponse logout() throws Exception {
      return send(post("/api/v1/auth/logout"));
    }

    /** The raw session ID as stored in the database; the cookie holds it base64-encoded. */
    String sessionId() {
      return new String(Base64.getDecoder().decode(session), StandardCharsets.UTF_8);
    }
  }

  record TestUser(UUID id, String email, String password) {}

  private TestUser createUser(boolean verified) {
    UUID id = UUID.randomUUID();
    String email = "user-" + id + "@example.test";
    String password = "test-password-" + UUID.randomUUID();
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        "INSERT INTO users (id, email, password_hash, email_verified_at, password_changed_at,"
            + " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id,
        email,
        passwordEncoder.encode(password),
        verified ? now : null,
        now,
        now,
        now);
    return new TestUser(id, email, password);
  }

  private Browser signedIn(TestUser user) throws Exception {
    Browser browser = new Browser();
    browser.fetchCsrf();
    assertThat(browser.login(user.email(), user.password()).getStatus()).isEqualTo(200);
    browser.fetchCsrf();
    return browser;
  }

  private long sessionRows() {
    return jdbc.queryForObject("SELECT count(*) FROM spring_session", Long.class);
  }

  private static String code(MockHttpServletResponse response) throws Exception {
    return JsonPath.read(response.getContentAsString(), "$.code");
  }

  // --- CSRF token and the pre-login session ---

  @Test
  void csrfEndpointIssuesATokenAndAShortLivedHardenedCookie() throws Exception {
    Browser browser = new Browser();
    MockHttpServletResponse response = browser.fetchCsrf();

    assertThat(response.getStatus()).isEqualTo(200);
    assertThat((String) JsonPath.read(response.getContentAsString(), "$.headerName"))
        .isEqualTo("X-XSRF-TOKEN");
    assertThat(browser.csrf).isNotBlank();

    String cookie =
        response.getHeaders("Set-Cookie").stream()
            .filter(h -> h.startsWith(COOKIE + "="))
            .findFirst()
            .orElseThrow();
    assertThat(cookie).contains("HttpOnly", "SameSite=Strict", "Path=/");

    Integer maxInactive =
        jdbc.queryForObject(
            "SELECT max_inactive_interval FROM spring_session WHERE session_id = ?",
            Integer.class,
            browser.sessionId());
    assertThat(maxInactive).isEqualTo(600);
  }

  @Test
  void tokenIsMaskedDifferentlyOnEachRequest() throws Exception {
    Browser browser = new Browser();
    browser.fetchCsrf();
    String first = browser.csrf;
    browser.fetchCsrf();
    assertThat(browser.csrf).isNotEqualTo(first);
  }

  @Test
  void anonymousPostsCreateNoSessionRows() throws Exception {
    long before = sessionRows();
    Browser browser = new Browser();
    for (int i = 0; i < 5; i++) {
      MockHttpServletResponse response = browser.login("someone@example.test", "whatever");
      assertThat(response.getStatus()).isEqualTo(403);
      assertThat(code(response)).isEqualTo("CSRF_REJECTED");
      assertThat(response.getHeaders("Set-Cookie")).isEmpty();
    }
    assertThat(browser.send(post("/api/v1/anything")).getStatus()).isEqualTo(403);
    assertThat(sessionRows()).isEqualTo(before);
  }

  @Test
  void loginWithoutAValidCsrfTokenIsRejected() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();
    browser.csrf = "not-the-token";
    MockHttpServletResponse response = browser.login(user.email(), user.password());
    assertThat(response.getStatus()).isEqualTo(403);
    assertThat(code(response)).isEqualTo("CSRF_REJECTED");
  }

  // --- Login ---

  @Test
  void loginReturnsTheUserAndRotatesTheSessionId() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();
    String preLoginSession = browser.session;

    MockHttpServletResponse response = browser.login(user.email(), user.password());

    assertThat(response.getStatus()).isEqualTo(200);
    String body = response.getContentAsString();
    assertThat((String) JsonPath.read(body, "$.id")).isEqualTo(user.id().toString());
    assertThat((String) JsonPath.read(body, "$.email")).isEqualTo(user.email());
    assertThat(body).doesNotContain("password", "hash");
    assertThat(browser.session).isNotNull().isNotEqualTo(preLoginSession);

    Browser attacker = new Browser();
    attacker.session = preLoginSession;
    assertThat(attacker.me().getStatus()).isEqualTo(401);
  }

  @Test
  void loginAcceptsTheEmailInAnyCaseWithSurroundingSpaces() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();
    assertThat(browser.login("  " + user.email().toUpperCase() + " ", user.password()).getStatus())
        .isEqualTo(200);
  }

  @Test
  void sessionTableHoldsTheUserIdNotTheEmail() throws Exception {
    TestUser user = createUser(true);
    Browser browser = signedIn(user);

    String principal =
        jdbc.queryForObject(
            "SELECT principal_name FROM spring_session WHERE session_id = ?",
            String.class,
            browser.sessionId());
    assertThat(principal).isEqualTo(user.id().toString());

    Long rowsWithEmail =
        jdbc.queryForObject(
            "SELECT count(*) FROM spring_session_attributes"
                + " WHERE position(convert_to(?, 'UTF8') in attribute_bytes) > 0",
            Long.class,
            user.email());
    assertThat(rowsWithEmail).isZero();

    Integer maxInactive =
        jdbc.queryForObject(
            "SELECT max_inactive_interval FROM spring_session WHERE session_id = ?",
            Integer.class,
            browser.sessionId());
    assertThat(maxInactive).isEqualTo(1800);
  }

  @Test
  void wrongPasswordAndUnknownEmailGiveTheSameAnswer() throws Exception {
    TestUser user = createUser(true);
    Browser a = new Browser();
    a.fetchCsrf();
    Browser b = new Browser();
    b.fetchCsrf();

    MockHttpServletResponse wrongPassword = a.login(user.email(), "wrong-" + user.password());
    MockHttpServletResponse unknownEmail = b.login("missing-" + user.email(), user.password());

    for (MockHttpServletResponse response : List.of(wrongPassword, unknownEmail)) {
      assertThat(response.getStatus()).isEqualTo(401);
      assertThat(response.getContentType()).isEqualTo("application/problem+json");
      assertThat(code(response)).isEqualTo("INVALID_CREDENTIALS");
    }
    assertThat(wrongPassword.getContentAsString().replaceAll("\"traceId\":\"\\w+\"", ""))
        .isEqualTo(unknownEmail.getContentAsString().replaceAll("\"traceId\":\"\\w+\"", ""));
  }

  @Test
  void unverifiedEmailIsRevealedOnlyAfterTheCorrectPassword() throws Exception {
    TestUser user = createUser(false);
    Browser browser = new Browser();
    browser.fetchCsrf();

    MockHttpServletResponse wrong = browser.login(user.email(), "wrong-" + user.password());
    assertThat(wrong.getStatus()).isEqualTo(401);
    assertThat(code(wrong)).isEqualTo("INVALID_CREDENTIALS");

    MockHttpServletResponse right = browser.login(user.email(), user.password());
    assertThat(right.getStatus()).isEqualTo(403);
    assertThat(code(right)).isEqualTo("EMAIL_NOT_VERIFIED");
    assertThat(browser.me().getStatus()).isEqualTo(401);
  }

  @Test
  void accountPasswordsAreStoredAsArgon2idAtTheConfiguredCost() {
    TestUser user = createUser(true);
    String hash =
        jdbc.queryForObject(
            "SELECT password_hash FROM users WHERE id = ?", String.class, user.id());
    assertThat(hash).startsWith("$argon2id$v=19$m=19456,t=2,p=1$").doesNotContain(user.password());
  }

  // --- Validation ---

  @Test
  void unknownFieldsAreRejectedSoNothingExtraCanBeSent() throws Exception {
    Browser browser = new Browser();
    browser.fetchCsrf();
    MockHttpServletResponse response =
        browser.send(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"a@example.test\",\"accountPassword\":\"x\","
                        + "\"masterPassword\":\"must-not-be-accepted\"}"));
    assertThat(response.getStatus()).isEqualTo(400);
    assertThat(code(response)).isEqualTo("VALIDATION_FAILED");
    assertThat(response.getContentAsString()).doesNotContain("must-not-be-accepted");
  }

  @Test
  void missingAndOversizedFieldsAreValidationErrors() throws Exception {
    Browser browser = new Browser();
    browser.fetchCsrf();
    MockHttpServletResponse missing =
        browser.send(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@example.test\"}"));
    assertThat(missing.getStatus()).isEqualTo(400);
    assertThat((String) JsonPath.read(missing.getContentAsString(), "$.errors[0].field"))
        .isEqualTo("accountPassword");

    MockHttpServletResponse tooLong = browser.login("a@example.test", "x".repeat(129));
    assertThat(tooLong.getStatus()).isEqualTo(400);
    assertThat(tooLong.getContentAsString()).doesNotContain("x".repeat(129));
  }

  // --- Logout and expiry ---

  @Test
  void logoutEndsTheSessionAndRemovesItsRow() throws Exception {
    Browser browser = signedIn(createUser(true));
    String sessionId = browser.sessionId();
    assertThat(browser.me().getStatus()).isEqualTo(200);

    MockHttpServletResponse response = browser.logout();

    assertThat(response.getStatus()).isEqualTo(204);
    assertThat(browser.session).isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM spring_session WHERE session_id = ?", Long.class, sessionId))
        .isZero();
    assertThat(browser.me().getStatus()).isEqualTo(401);
  }

  @Test
  void theCsrfTokenFromBeforeLoginStopsWorkingAfterLogin() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();
    String preLoginToken = browser.csrf;
    browser.login(user.email(), user.password());

    browser.csrf = preLoginToken;
    MockHttpServletResponse stale = browser.logout();
    assertThat(stale.getStatus()).isEqualTo(403);
    assertThat(code(stale)).isEqualTo("CSRF_REJECTED");

    browser.fetchCsrf();
    assertThat(browser.logout().getStatus()).isEqualTo(204);
  }

  @Test
  void anIdleSessionExpires() throws Exception {
    Browser browser = signedIn(createUser(true));
    long thirtyOneMinutes = Duration.ofMinutes(31).toMillis();
    jdbc.update(
        "UPDATE spring_session SET last_access_time = last_access_time - ?,"
            + " expiry_time = expiry_time - ? WHERE session_id = ?",
        thirtyOneMinutes,
        thirtyOneMinutes,
        browser.sessionId());

    assertThat(browser.me().getStatus()).isEqualTo(401);
  }

  @Test
  void anActiveSessionStillEndsAfterEightHours() throws Exception {
    Browser browser = signedIn(createUser(true));
    clock.advance(Duration.ofHours(7).plusMinutes(59));
    assertThat(browser.me().getStatus()).isEqualTo(200);

    clock.advance(Duration.ofMinutes(2));
    MockHttpServletResponse response = browser.me();
    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(code(response)).isEqualTo("UNAUTHENTICATED");
  }

  // --- Origin and Fetch Metadata ---

  @Test
  void requestsFromAnotherSiteAreRejectedEvenWithAValidToken() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();

    browser.origin = "https://attacker.example";
    MockHttpServletResponse foreignOrigin = browser.login(user.email(), user.password());
    assertThat(foreignOrigin.getStatus()).isEqualTo(403);
    assertThat(code(foreignOrigin)).isEqualTo("CSRF_REJECTED");

    browser.origin = null;
    MockHttpServletResponse crossSite =
        browser.send(
            post("/api/v1/auth/login")
                .header("Sec-Fetch-Site", "cross-site")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"email\":\"%s\",\"accountPassword\":\"%s\"}"
                        .formatted(user.email(), user.password())));
    assertThat(crossSite.getStatus()).isEqualTo(403);

    browser.origin = "http://localhost:3000";
    assertThat(browser.login(user.email(), user.password()).getStatus()).isEqualTo(200);
  }

  // --- Throttling ---

  @Test
  void repeatedLoginAttemptsAreThrottledWithRetryAfter() throws Exception {
    TestUser user = createUser(true);
    Browser browser = new Browser();
    browser.fetchCsrf();
    for (int i = 0; i < 5; i++) {
      assertThat(browser.login(user.email(), "wrong-" + i).getStatus()).isEqualTo(401);
    }

    MockHttpServletResponse throttled = browser.login(user.email(), user.password());

    assertThat(throttled.getStatus()).isEqualTo(429);
    assertThat(code(throttled)).isEqualTo("RATE_LIMITED");
    assertThat(Long.parseLong(throttled.getHeader("Retry-After"))).isPositive();

    Browser otherIp = new Browser();
    otherIp.fetchCsrf();
    assertThat(otherIp.login(user.email(), user.password()).getStatus()).isEqualTo(200);
  }

  // --- Access rules ---

  @Test
  void protectedEndpointsAnswer401AsProblemJson() throws Exception {
    MockHttpServletResponse response = new Browser().me();
    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(response.getContentType()).isEqualTo("application/problem+json");
    assertThat(code(response)).isEqualTo("UNAUTHENTICATED");
    assertThat((String) JsonPath.read(response.getContentAsString(), "$.traceId"))
        .matches("[0-9a-f]{16}");
  }

  @Test
  void unknownPathsAreClosed() throws Exception {
    Browser anonymous = new Browser();
    assertThat(anonymous.send(get("/api/v1/anything")).getStatus()).isEqualTo(401);
    assertThat(anonymous.send(get("/login")).getStatus()).isEqualTo(401);

    Browser browser = signedIn(createUser(true));
    MockHttpServletResponse missing = browser.send(get("/api/v1/does-not-exist"));
    assertThat(missing.getStatus()).isEqualTo(404);
    assertThat(code(missing)).isEqualTo("NOT_FOUND");
    assertThat(browser.send(get("/login")).getStatus()).isEqualTo(403);
  }
}
