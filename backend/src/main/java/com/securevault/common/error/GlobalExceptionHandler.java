package com.securevault.common.error;

import com.securevault.common.error.Problems.FieldProblem;
import com.securevault.common.ratelimit.RateLimitedException;
import com.securevault.common.security.RequestSizeLimitFilter;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * The single place that turns exceptions into responses. Bodies never contain stack traces,
 * exception messages, SQL, or the rejected input values.
 */
@RestControllerAdvice
class GlobalExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
  private static final MediaType PROBLEM = MediaType.parseMediaType(Problems.CONTENT_TYPE);

  @ExceptionHandler(RateLimitedException.class)
  ResponseEntity<Map<String, Object>> rateLimited(RateLimitedException e) {
    return ResponseEntity.status(e.code().status())
        .header(HttpHeaders.RETRY_AFTER, Long.toString(e.retryAfterSeconds()))
        .contentType(PROBLEM)
        .body(Problems.body(e.code(), Problems.newTraceId()));
  }

  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, Object>> api(ApiException e) {
    return problem(e.code(), List.of());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException e) {
    List<FieldProblem> errors =
        e.getBindingResult().getFieldErrors().stream()
            .map(f -> new FieldProblem(f.getField(), f.getDefaultMessage()))
            .toList();
    return problem(ErrorCode.VALIDATION_FAILED, errors);
  }

  /**
   * Malformed JSON, wrong types, or unknown fields, which could otherwise smuggle in plaintext. A
   * body cut off by RequestSizeLimitFilter also surfaces here, wrapped in the parse error.
   */
  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException e) {
    for (Throwable cause = e; cause != null; cause = cause.getCause()) {
      if (cause instanceof RequestSizeLimitFilter.PayloadTooLargeException) {
        return problem(ErrorCode.PAYLOAD_TOO_LARGE, List.of());
      }
    }
    return problem(ErrorCode.VALIDATION_FAILED, List.of());
  }

  /** Bad query or path parameters, such as a limit out of range or an ID that is not a UUID. */
  @ExceptionHandler({
    HandlerMethodValidationException.class,
    MethodArgumentTypeMismatchException.class,
    MissingServletRequestParameterException.class
  })
  ResponseEntity<Map<String, Object>> badParameter() {
    return problem(ErrorCode.VALIDATION_FAILED, List.of());
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<Map<String, Object>> notFound() {
    return problem(ErrorCode.NOT_FOUND, List.of());
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  ResponseEntity<Map<String, Object>> methodNotAllowed() {
    return problem(ErrorCode.METHOD_NOT_ALLOWED, List.of());
  }

  @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
  ResponseEntity<Map<String, Object>> unsupportedMediaType() {
    return problem(ErrorCode.UNSUPPORTED_MEDIA_TYPE, List.of());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, Object>> unexpected(Exception e) {
    String traceId = Problems.newTraceId();
    // The exception message is deliberately not logged: it can contain SQL values or input.
    StackTraceElement[] trace = e.getStackTrace();
    log.error(
        "Unhandled exception traceId={} type={} at={}",
        traceId,
        e.getClass().getName(),
        trace.length > 0 ? trace[0] : "unknown");
    return ResponseEntity.status(ErrorCode.INTERNAL_ERROR.status())
        .contentType(PROBLEM)
        .body(Problems.body(ErrorCode.INTERNAL_ERROR, traceId));
  }

  private static ResponseEntity<Map<String, Object>> problem(
      ErrorCode code, List<FieldProblem> errors) {
    return ResponseEntity.status(code.status())
        .contentType(PROBLEM)
        .body(Problems.body(code, Problems.newTraceId(), errors));
  }
}
