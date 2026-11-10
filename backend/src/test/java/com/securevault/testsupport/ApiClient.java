package com.securevault.testsupport;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.json.JsonMapper;

/**
 * A simulated browser: it keeps the session cookie and the in-memory CSRF token, and sends every
 * request from its own random IP so rate limits in one test do not affect another.
 */
public final class ApiClient {

  public static final String COOKIE = "SV_SESSION";

  /** A response with helpers for the parts tests check. */
  public record Response(MockHttpServletResponse raw) {
    public int status() {
      return raw.getStatus();
    }

    public String body() {
      try {
        return raw.getContentAsString(StandardCharsets.UTF_8);
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
    }

    public <T> T json(String path) {
      return JsonPath.read(body(), path);
    }

    public String code() {
      return json("$.code");
    }

    public String header(String name) {
      return raw.getHeader(name);
    }
  }

  private final MockMvc mvc;
  private final JsonMapper json;
  public String session;
  public String csrf;
  public String origin;
  public final String ip =
      "10.%d.%d.%d"
          .formatted(
              ThreadLocalRandom.current().nextInt(256),
              ThreadLocalRandom.current().nextInt(256),
              ThreadLocalRandom.current().nextInt(1, 255));

  public ApiClient(MockMvc mvc, JsonMapper json) {
    this.mvc = mvc;
    this.json = json;
  }

  public Response send(MockHttpServletRequestBuilder request) {
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
    try {
      MockHttpServletResponse response = mvc.perform(request).andReturn().getResponse();
      for (String header : response.getHeaders("Set-Cookie")) {
        if (header.startsWith(COOKIE + "=")) {
          String value = header.substring(COOKIE.length() + 1, header.indexOf(';'));
          session = value.isEmpty() || header.contains("Max-Age=0") ? null : value;
        }
      }
      return new Response(response);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  public Response get(String path) {
    return send(MockMvcRequestBuilders.get(path));
  }

  public Response post(String path, Object body) {
    return send(withJson(MockMvcRequestBuilders.post(path), body));
  }

  public Response put(String path, Object body) {
    return send(withJson(MockMvcRequestBuilders.put(path), body));
  }

  public Response delete(String path) {
    return send(MockMvcRequestBuilders.delete(path));
  }

  public Response postRaw(String path, String contentType, String content) {
    return send(MockMvcRequestBuilders.post(path).contentType(contentType).content(content));
  }

  public ApiClient fetchCsrf() {
    csrf = get("/api/v1/auth/csrf").json("$.token");
    return this;
  }

  public Response login(String email, String password) {
    return post("/api/v1/auth/login", Map.of("email", email, "accountPassword", password));
  }

  /** The raw session ID as stored in the database; the cookie holds it base64-encoded. */
  public String sessionId() {
    return new String(Base64.getDecoder().decode(session), StandardCharsets.UTF_8);
  }

  private MockHttpServletRequestBuilder withJson(
      MockHttpServletRequestBuilder request, Object body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }
}
