package com.securevault.common.error;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Writes problem responses from servlet filters, which run before Spring MVC. */
@Component
public class ProblemResponseWriter {

  private final JsonMapper jsonMapper;

  public ProblemResponseWriter(JsonMapper jsonMapper) {
    this.jsonMapper = jsonMapper;
  }

  public void write(HttpServletResponse response, ErrorCode code) throws IOException {
    response.setStatus(code.status().value());
    // Same header as the MVC error path. Jackson writes UTF-8 bytes to the stream either way.
    response.setContentType(Problems.CONTENT_TYPE);
    jsonMapper.writeValue(response.getOutputStream(), Problems.body(code, Problems.newTraceId()));
  }
}
