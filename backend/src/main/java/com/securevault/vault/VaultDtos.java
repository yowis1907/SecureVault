package com.securevault.vault;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Request and response shapes from the API specification. Binary fields are byte arrays, which
 * Jackson reads and writes as base64. Every limit here is repeated by a database CHECK constraint.
 */
public final class VaultDtos {

  private VaultDtos() {}

  public record KdfParams(
      @NotNull @Pattern(regexp = "ARGON2ID") String algorithm,
      @NotNull @Min(65536) @Max(1048576) Integer memoryKib,
      @NotNull @Min(3) @Max(10) Integer iterations,
      @NotNull @Min(1) @Max(4) Integer parallelism,
      @NotNull @Size(min = 16, max = 16) byte[] salt) {}

  public record VaultKeyMaterial(
      @NotNull UUID vaultId,
      @NotNull @Min(1) @Max(1) Integer cryptoVersion,
      @NotNull @Valid KdfParams kdf,
      @NotNull @Size(min = 48, max = 48) byte[] wrappedDek,
      @NotNull @Size(min = 12, max = 12) byte[] wrapNonce) {}

  public record EncryptedSettings(
      @NotNull @Size(min = 12, max = 12) byte[] nonce,
      @NotNull @Size(min = 16, max = 8192) byte[] ciphertext) {}

  public record VaultResponse(
      UUID vaultId,
      int cryptoVersion,
      KdfParams kdf,
      byte[] wrappedDek,
      byte[] wrapNonce,
      int keyVersion,
      EncryptedSettings settings) {}

  public record KeyMaterialUpdate(
      @NotEmpty @Size(max = 128) String accountPassword,
      @NotNull @Min(1) Integer expectedKeyVersion,
      @NotNull @Valid KdfParams kdf,
      @NotNull @Size(min = 48, max = 48) byte[] wrappedDek,
      @NotNull @Size(min = 12, max = 12) byte[] wrapNonce) {
    @Override
    public String toString() {
      return "KeyMaterialUpdate[<redacted>]";
    }
  }

  public record KeyVersionResponse(int keyVersion) {}

  public record VaultResetRequest(
      @NotEmpty @Size(max = 128) String accountPassword,
      @NotNull @Pattern(regexp = "DELETE MY VAULT") String confirmation,
      @NotNull @Valid VaultKeyMaterial vault) {
    @Override
    public String toString() {
      return "VaultResetRequest[<redacted>]";
    }
  }

  public enum RecordType {
    LOGIN,
    CATEGORY
  }

  public record NewRecord(
      @NotNull UUID id,
      @NotNull RecordType type,
      @NotNull @Min(1) @Max(1) Integer cryptoVersion,
      @NotNull @Size(min = 12, max = 12) byte[] nonce,
      @NotNull @Size(min = 16, max = 65536) byte[] ciphertext) {}

  public record RecordUpdate(
      @NotNull @Min(1) Long version,
      @NotNull @Min(1) @Max(1) Integer cryptoVersion,
      @NotNull @Size(min = 12, max = 12) byte[] nonce,
      @NotNull @Size(min = 16, max = 65536) byte[] ciphertext) {}

  public record BatchRequest(
      @NotNull @Size(min = 1, max = 200) List<@NotNull @Valid NewRecord> records) {}

  public record VaultRecord(
      UUID id,
      RecordType type,
      int cryptoVersion,
      byte[] nonce,
      byte[] ciphertext,
      long version,
      Instant createdAt,
      Instant updatedAt) {}

  public record RecordPage(List<VaultRecord> records, String nextCursor) {}

  public record RecordList(List<VaultRecord> records) {}
}
