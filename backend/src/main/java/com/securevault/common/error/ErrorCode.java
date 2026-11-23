package com.securevault.common.error;

import org.springframework.http.HttpStatus;

/** The `code` values from docs/API_SPECIFICATION.md. Titles are fixed text with no user data. */
public enum ErrorCode {
  VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Validation failed"),
  INVALID_TOKEN(HttpStatus.BAD_REQUEST, "Invalid or expired link"),
  UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Authentication required"),
  INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Invalid email or password"),
  INVALID_MFA_CODE(HttpStatus.UNAUTHORIZED, "Invalid verification code"),
  MFA_CHALLENGE_EXPIRED(HttpStatus.UNAUTHORIZED, "Sign-in timed out"),
  CSRF_REJECTED(HttpStatus.FORBIDDEN, "Request rejected"),
  EMAIL_NOT_VERIFIED(HttpStatus.FORBIDDEN, "Email address not verified"),
  STEP_UP_FAILED(HttpStatus.FORBIDDEN, "Account password is incorrect"),
  FORBIDDEN(HttpStatus.FORBIDDEN, "Forbidden"),
  NOT_FOUND(HttpStatus.NOT_FOUND, "Not found"),
  METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed"),
  VERSION_CONFLICT(HttpStatus.CONFLICT, "Changed by another request"),
  MFA_STATE_CONFLICT(HttpStatus.CONFLICT, "Two-factor sign-in is not in that state"),
  RECORD_ID_CONFLICT(HttpStatus.CONFLICT, "Record ID already exists"),
  PAYLOAD_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "Request too large"),
  UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported media type"),
  QUOTA_EXCEEDED(HttpStatus.UNPROCESSABLE_CONTENT, "Record limit reached"),
  RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Too many requests"),
  INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Internal error");

  private final HttpStatus status;
  private final String title;

  ErrorCode(HttpStatus status, String title) {
    this.status = status;
    this.title = title;
  }

  public HttpStatus status() {
    return status;
  }

  public String title() {
    return title;
  }
}
