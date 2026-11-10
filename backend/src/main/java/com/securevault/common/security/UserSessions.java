package com.securevault.common.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;

/**
 * A user's sessions, found through Spring Session's principal-name index (the user UUID). Clients
 * only ever see a handle: a truncated SHA-256 of the session ID. Knowing a handle does not let
 * anyone use the session.
 */
@Component
public class UserSessions {

  public record SessionInfo(
      String handle, Instant createdAt, Instant lastAccessedAt, boolean current) {}

  private final FindByIndexNameSessionRepository<? extends Session> sessions;

  public UserSessions(FindByIndexNameSessionRepository<? extends Session> sessions) {
    this.sessions = sessions;
  }

  public List<SessionInfo> list(UUID userId, String currentSessionId) {
    return byId(userId).values().stream()
        .map(s ->
            new SessionInfo(
                handle(s.getId()),
                s.getCreationTime(),
                s.getLastAccessedTime(),
                s.getId().equals(currentSessionId)))
        .sorted(Comparator.comparing(SessionInfo::lastAccessedAt).reversed())
        .toList();
  }

  /** Returns false when the handle does not match one of this user's sessions. */
  public boolean revoke(UUID userId, String handle) {
    return byId(userId).keySet().stream()
        .filter(id -> MessageDigest.isEqual(bytes(handle(id)), bytes(handle)))
        .findFirst()
        .map(id -> {
          sessions.deleteById(id);
          return true;
        })
        .orElse(false);
  }

  public void revokeAllExcept(UUID userId, String keepSessionId) {
    byId(userId).keySet().stream()
        .filter(id -> !id.equals(keepSessionId))
        .forEach(sessions::deleteById);
  }

  public void revokeAll(UUID userId) {
    byId(userId).keySet().forEach(sessions::deleteById);
  }

  private Map<String, ? extends Session> byId(UUID userId) {
    return sessions.findByPrincipalName(userId.toString());
  }

  static String handle(String sessionId) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(sessionId.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest, 0, 16);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required by every Java platform", e);
    }
  }

  private static byte[] bytes(String value) {
    return value.getBytes(StandardCharsets.UTF_8);
  }
}
