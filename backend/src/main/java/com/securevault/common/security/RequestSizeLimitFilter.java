package com.securevault.common.security;

import com.securevault.common.error.ErrorCode;
import com.securevault.common.error.ProblemResponseWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Body limits from the API specification: 256 KiB, or 8 MiB for the batch import. A declared length
 * over the limit is refused before anything is read. A body without a declared length is counted
 * while it is read, so chunked uploads cannot get around the limit.
 */
public class RequestSizeLimitFilter extends OncePerRequestFilter {

  static final long DEFAULT_LIMIT = 256 * 1024;
  static final long BATCH_LIMIT = 8 * 1024 * 1024;
  private static final String BATCH_PATH = "/api/v1/vault/records/batch";

  private final ProblemResponseWriter problems;

  public RequestSizeLimitFilter(ProblemResponseWriter problems) {
    this.problems = problems;
  }

  /**
   * Thrown while reading; GlobalExceptionHandler finds it inside the parse error and answers 413.
   */
  public static final class PayloadTooLargeException extends IOException {
    PayloadTooLargeException() {
      super("Request body exceeds the limit", null);
    }
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    long limit = BATCH_PATH.equals(request.getRequestURI()) ? BATCH_LIMIT : DEFAULT_LIMIT;
    if (request.getContentLengthLong() > limit) {
      problems.write(response, ErrorCode.PAYLOAD_TOO_LARGE);
      return;
    }
    chain.doFilter(new LimitedRequest(request, limit), response);
  }

  private static final class LimitedRequest extends HttpServletRequestWrapper {
    private final long limit;
    private ServletInputStream stream;

    LimitedRequest(HttpServletRequest request, long limit) {
      super(request);
      this.limit = limit;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
      if (stream == null) {
        stream = new LimitedStream(super.getInputStream(), limit);
      }
      return stream;
    }
  }

  private static final class LimitedStream extends ServletInputStream {
    private final ServletInputStream delegate;
    private final long limit;
    private long count;

    LimitedStream(ServletInputStream delegate, long limit) {
      this.delegate = delegate;
      this.limit = limit;
    }

    @Override
    public int read() throws IOException {
      int b = delegate.read();
      if (b != -1) {
        count(1);
      }
      return b;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
      int n = delegate.read(buffer, offset, length);
      if (n > 0) {
        count(n);
      }
      return n;
    }

    private void count(int n) throws PayloadTooLargeException {
      count += n;
      if (count > limit) {
        throw new PayloadTooLargeException();
      }
    }

    @Override
    public boolean isFinished() {
      return delegate.isFinished();
    }

    @Override
    public boolean isReady() {
      return delegate.isReady();
    }

    @Override
    public void setReadListener(ReadListener listener) {
      delegate.setReadListener(listener);
    }
  }
}
