package com.securevault.common.error;

/** An expected failure with a documented error code. Carries no message, so nothing can leak. */
public class ApiException extends RuntimeException {

  private final ErrorCode code;

  public ApiException(ErrorCode code) {
    super(code.name(), null, false, false);
    this.code = code;
  }

  public ErrorCode code() {
    return code;
  }
}
