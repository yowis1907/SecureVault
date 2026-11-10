package com.securevault.vault;

import com.securevault.common.config.Db;
import com.securevault.vault.VaultDtos.NewRecord;
import com.securevault.vault.VaultDtos.RecordType;
import com.securevault.vault.VaultDtos.RecordUpdate;
import com.securevault.vault.VaultDtos.VaultRecord;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Explicit SQL rather than JPA's save(), which merges when given an existing ID and could overwrite
 * another user's row with a client-chosen ID. Every lookup includes user_id.
 */
@Repository
class RecordRepository {

  private static final String COLUMNS =
      "id, record_type, crypto_version, nonce, ciphertext, version, created_at, updated_at";

  private final JdbcClient jdbc;

  RecordRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  /** Plain INSERT: an existing ID, whoever owns it, fails with a duplicate key error. */
  VaultRecord insert(UUID userId, NewRecord r, Instant now) {
    return jdbc.sql(
            "INSERT INTO vault_records (id, user_id, record_type, crypto_version, nonce,"
                + " ciphertext, version, created_at, updated_at)"
                + " VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING "
                + COLUMNS)
        .params(
            r.id(),
            userId,
            r.type().name(),
            r.cryptoVersion(),
            r.nonce(),
            r.ciphertext(),
            Db.ts(now),
            Db.ts(now))
        .query(RecordRepository::map)
        .single();
  }

  Optional<VaultRecord> find(UUID userId, UUID id) {
    return jdbc.sql("SELECT " + COLUMNS + " FROM vault_records WHERE id = ? AND user_id = ?")
        .params(id, userId)
        .query(RecordRepository::map)
        .optional();
  }

  /** Keyset pagination by ID: stable while records change, and fast at any depth. */
  List<VaultRecord> page(UUID userId, UUID after, int limit) {
    if (after == null) {
      return jdbc.sql(
              "SELECT " + COLUMNS + " FROM vault_records WHERE user_id = ? ORDER BY id LIMIT ?")
          .params(userId, limit)
          .query(RecordRepository::map)
          .list();
    }
    return jdbc.sql(
            "SELECT "
                + COLUMNS
                + " FROM vault_records WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?")
        .params(userId, after, limit)
        .query(RecordRepository::map)
        .list();
  }

  /** Updates only when the stored version matches what the client last read. */
  Optional<VaultRecord> update(UUID userId, UUID id, RecordUpdate u, Instant now) {
    return jdbc.sql(
            "UPDATE vault_records SET crypto_version = ?, nonce = ?, ciphertext = ?,"
                + " version = version + 1, updated_at = ?"
                + " WHERE id = ? AND user_id = ? AND version = ? RETURNING "
                + COLUMNS)
        .params(u.cryptoVersion(), u.nonce(), u.ciphertext(), Db.ts(now), id, userId, u.version())
        .query(RecordRepository::map)
        .optional();
  }

  boolean delete(UUID userId, UUID id) {
    return jdbc.sql("DELETE FROM vault_records WHERE id = ? AND user_id = ?")
            .params(id, userId)
            .update()
        == 1;
  }

  long count(UUID userId) {
    return jdbc.sql("SELECT count(*) FROM vault_records WHERE user_id = ?")
        .param(userId)
        .query(Long.class)
        .single();
  }

  void deleteAll(UUID userId) {
    jdbc.sql("DELETE FROM vault_records WHERE user_id = ?").param(userId).update();
  }

  private static VaultRecord map(ResultSet rs, int row) throws SQLException {
    return new VaultRecord(
        rs.getObject("id", UUID.class),
        RecordType.valueOf(rs.getString("record_type")),
        rs.getInt("crypto_version"),
        rs.getBytes("nonce"),
        rs.getBytes("ciphertext"),
        rs.getLong("version"),
        Db.instant(rs, "created_at"),
        Db.instant(rs, "updated_at"));
  }
}
