package com.securevault.common.error;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds RFC 9457 problem bodies. Controllers and security filters share this, so every error has
 * the same shape whether Spring MVC or the filter chain produced it.
 */
public final class Problems {

  public static final String CONTENT_TYPE = "application/problem+json";

  private static final SecureRandom RANDOM = new SecureRandom();

  private Problems() {}

  public record FieldProblem(String field, String message) {}

  /** A random ID that appears in the response and the log, linking the two. */
  public static String newTraceId() {
    byte[] bytes = new byte[8];
    RANDOM.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  public static Map<String, Object> body(ErrorCode code, String traceId) {
    return body(code, traceId, List.of());
  }

  public static Map<String, Object> body(
      ErrorCode code, String traceId, List<FieldProblem> errors) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("type", "about:blank");
    body.put("title", code.title());
    body.put("status", code.status().value());
    body.put("code", code.name());
    body.put("traceId", traceId);
    if (!errors.isEmpty()) {
      body.put("errors", errors);
    }
    return body;
  }
}
