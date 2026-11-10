package com.securevault.vault;

import com.securevault.common.config.Db;
import com.securevault.vault.VaultDtos.EncryptedSettings;
import com.securevault.vault.VaultDtos.KdfParams;
import com.securevault.vault.VaultDtos.VaultKeyMaterial;
import com.securevault.vault.VaultDtos.VaultResponse;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every statement is scoped by user_id; there is no way to address a vault by its ID alone. */
@Repository
class VaultRepository {

  private final JdbcClient jdbc;

  VaultRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  void insert(UUID userId, VaultKeyMaterial v, Instant now) {
    jdbc.sql(
            "INSERT INTO vaults (id, user_id, crypto_version, kdf_algorithm, kdf_memory_kib,"
                + " kdf_iterations, kdf_parallelism, kdf_salt, wrapped_dek, wrap_nonce,"
                + " key_version, created_at, updated_at)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
        .params(
            v.vaultId(),
            userId,
            v.cryptoVersion(),
            v.kdf().algorithm(),
            v.kdf().memoryKib(),
            v.kdf().iterations(),
            v.kdf().parallelism(),
            v.kdf().salt(),
            v.wrappedDek(),
            v.wrapNonce(),
            Db.ts(now),
            Db.ts(now))
        .update();
  }

  Optional<VaultResponse> find(UUID userId) {
    return jdbc.sql("SELECT * FROM vaults WHERE user_id = ?")
        .param(userId)
        .query((rs, i) -> {
          byte[] settingsCiphertext = rs.getBytes("settings_ciphertext");
          return new VaultResponse(
              rs.getObject("id", UUID.class),
              rs.getInt("crypto_version"),
              new KdfParams(
                  rs.getString("kdf_algorithm"),
                  rs.getInt("kdf_memory_kib"),
                  rs.getInt("kdf_iterations"),
                  rs.getInt("kdf_parallelism"),
                  rs.getBytes("kdf_salt")),
              rs.getBytes("wrapped_dek"),
              rs.getBytes("wrap_nonce"),
              rs.getInt("key_version"),
              settingsCiphertext == null
                  ? null
                  : new EncryptedSettings(rs.getBytes("settings_nonce"), settingsCiphertext));
        })
        .optional();
  }

  /**
   * Replaces the wrapped key only if nobody changed it since the client read it. Returns the new
   * key version, or empty when the expected version is stale.
   */
  Optional<Integer> replaceKeyMaterial(
      UUID userId,
      int expectedKeyVersion,
      KdfParams kdf,
      byte[] wrappedDek,
      byte[] wrapNonce,
      Instant now) {
    return jdbc.sql(
            "UPDATE vaults SET kdf_algorithm = ?, kdf_memory_kib = ?, kdf_iterations = ?,"
                + " kdf_parallelism = ?, kdf_salt = ?, wrapped_dek = ?, wrap_nonce = ?,"
                + " key_version = key_version + 1, updated_at = ?"
                + " WHERE user_id = ? AND key_version = ? RETURNING key_version")
        .params(
            kdf.algorithm(),
            kdf.memoryKib(),
            kdf.iterations(),
            kdf.parallelism(),
            kdf.salt(),
            wrappedDek,
            wrapNonce,
            Db.ts(now),
            userId,
            expectedKeyVersion)
        .query(Integer.class)
        .optional();
  }

  boolean replaceSettings(UUID userId, EncryptedSettings settings, Instant now) {
    return jdbc.sql(
                "UPDATE vaults SET settings_nonce = ?, settings_ciphertext = ?, updated_at = ?"
                    + " WHERE user_id = ?")
            .params(settings.nonce(), settings.ciphertext(), Db.ts(now), userId)
            .update()
        == 1;
  }

  /**
   * Locks the user's vault row until the transaction ends. Record inserts take this lock first, so
   * concurrent inserts are counted one at a time and cannot slip past the quota together.
   */
  boolean lock(UUID userId) {
    return jdbc.sql("SELECT 1 FROM vaults WHERE user_id = ? FOR UPDATE")
        .param(userId)
        .query(Integer.class)
        .optional()
        .isPresent();
  }

  void delete(UUID userId) {
    jdbc.sql("DELETE FROM vaults WHERE user_id = ?").param(userId).update();
  }
}
