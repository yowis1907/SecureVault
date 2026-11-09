package com.securevault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** Confirms the database itself rejects malformed cryptographic material. Requires Docker. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class SchemaConstraintsIT {

  private static final Timestamp NOW = Timestamp.from(Instant.parse("2026-11-08T12:00:00Z"));

  @Autowired private JdbcTemplate jdbcTemplate;

  private UUID userId;

  @BeforeEach
  void createUser() {
    userId = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO users (id, email, password_hash, password_changed_at, created_at, updated_at)"
            + " VALUES (?, ?, 'test-hash', ?, ?, ?)",
        userId,
        userId + "@example.test",
        NOW,
        NOW,
        NOW);
  }

  private void insertVault(int memoryKib, int saltLength, int wrappedLength, int nonceLength) {
    jdbcTemplate.update(
        "INSERT INTO vaults (id, user_id, crypto_version, kdf_algorithm, kdf_memory_kib,"
            + " kdf_iterations, kdf_parallelism, kdf_salt, wrapped_dek, wrap_nonce, created_at,"
            + " updated_at) VALUES (?, ?, 1, 'ARGON2ID', ?, 3, 1, ?, ?, ?, ?, ?)",
        UUID.randomUUID(),
        userId,
        memoryKib,
        new byte[saltLength],
        new byte[wrappedLength],
        new byte[nonceLength],
        NOW,
        NOW);
  }

  private void insertRecord(String type, int nonceLength, int ciphertextLength) {
    jdbcTemplate.update(
        "INSERT INTO vault_records (id, user_id, record_type, crypto_version, nonce, ciphertext,"
            + " created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)",
        UUID.randomUUID(),
        userId,
        type,
        new byte[nonceLength],
        new byte[ciphertextLength],
        NOW,
        NOW);
  }

  private static void assertRejected(Runnable insert) {
    assertThatThrownBy(insert::run).isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void acceptsWellFormedVault() {
    insertVault(65536, 16, 48, 12);
    assertThat(count("vaults")).isEqualTo(1);
  }

  @Test
  void rejectsKdfMemoryBelowFloor() {
    assertRejected(() -> insertVault(65535, 16, 48, 12));
  }

  @Test
  void rejectsWrongSaltLength() {
    assertRejected(() -> insertVault(65536, 15, 48, 12));
  }

  @Test
  void rejectsWrongWrappedKeyLength() {
    assertRejected(() -> insertVault(65536, 16, 47, 12));
  }

  @Test
  void rejectsWrongWrapNonceLength() {
    assertRejected(() -> insertVault(65536, 16, 48, 11));
  }

  @Test
  void acceptsWellFormedRecordAtSizeLimits() {
    insertRecord("LOGIN", 12, 16);
    insertRecord("CATEGORY", 12, 65536);
    assertThat(count("vault_records")).isEqualTo(2);
  }

  @Test
  void rejectsWrongRecordNonceLength() {
    assertRejected(() -> insertRecord("LOGIN", 16, 32));
  }

  @Test
  void rejectsCiphertextShorterThanTag() {
    assertRejected(() -> insertRecord("LOGIN", 12, 15));
  }

  @Test
  void rejectsOversizedCiphertext() {
    assertRejected(() -> insertRecord("LOGIN", 12, 65537));
  }

  @Test
  void rejectsUnknownRecordType() {
    assertRejected(() -> insertRecord("NOTE", 12, 32));
  }

  @Test
  void deletingUserRemovesOwnedCiphertext() {
    insertVault(65536, 16, 48, 12);
    insertRecord("LOGIN", 12, 32);
    jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
    assertThat(count("vaults")).isZero();
    assertThat(count("vault_records")).isZero();
  }

  private int count(String table) {
    Integer value =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId);
    return value == null ? 0 : value;
  }
}
