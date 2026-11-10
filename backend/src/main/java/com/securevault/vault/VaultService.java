package com.securevault.vault;

import com.securevault.account.StepUpService;
import com.securevault.activity.ActivityService;
import com.securevault.activity.ActivityType;
import com.securevault.common.error.ApiException;
import com.securevault.common.error.ErrorCode;
import com.securevault.vault.VaultDtos.EncryptedSettings;
import com.securevault.vault.VaultDtos.KeyMaterialUpdate;
import com.securevault.vault.VaultDtos.VaultKeyMaterial;
import com.securevault.vault.VaultDtos.VaultResponse;
import java.time.Clock;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stores and returns the material a browser needs to unlock. The server cannot use any of it: the
 * wrapped key only opens with a key derived from the master password, which never arrives here.
 */
@Service
public class VaultService {

  private final VaultRepository vaults;
  private final RecordRepository records;
  private final StepUpService stepUp;
  private final ActivityService activity;
  private final Clock clock;

  VaultService(
      VaultRepository vaults,
      RecordRepository records,
      StepUpService stepUp,
      ActivityService activity,
      Clock clock) {
    this.vaults = vaults;
    this.records = records;
    this.stepUp = stepUp;
    this.activity = activity;
    this.clock = clock;
  }

  /** Called during registration, inside its transaction. */
  @Transactional
  public void create(UUID userId, VaultKeyMaterial material) {
    vaults.insert(userId, material, clock.instant());
  }

  @Transactional(readOnly = true)
  public VaultResponse get(UUID userId) {
    return vaults.find(userId).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
  }

  /** Master password change: the client re-wrapped the same key under a new password. */
  @Transactional
  public int replaceKeyMaterial(UUID userId, KeyMaterialUpdate update) {
    stepUp.verify(userId, update.accountPassword());
    int keyVersion =
        vaults
            .replaceKeyMaterial(
                userId,
                update.expectedKeyVersion(),
                update.kdf(),
                update.wrappedDek(),
                update.wrapNonce(),
                clock.instant())
            .orElseThrow(() -> new ApiException(ErrorCode.VERSION_CONFLICT));
    activity.record(userId, ActivityType.MASTER_PASSWORD_CHANGED);
    return keyVersion;
  }

  @Transactional
  public void replaceSettings(UUID userId, EncryptedSettings settings) {
    if (!vaults.replaceSettings(userId, settings, clock.instant())) {
      throw new ApiException(ErrorCode.NOT_FOUND);
    }
  }

  /**
   * For a forgotten master password: every record is destroyed and a new, empty vault replaces the
   * old one. Nothing is recoverable, by design.
   */
  @Transactional
  public void reset(UUID userId, String accountPassword, VaultKeyMaterial newVault) {
    stepUp.verify(userId, accountPassword);
    records.deleteAll(userId);
    vaults.delete(userId);
    try {
      vaults.insert(userId, newVault, clock.instant());
    } catch (DuplicateKeyException e) {
      // The client must generate a fresh vault ID. Throwing rolls back the deletes above too.
      throw new ApiException(ErrorCode.VALIDATION_FAILED);
    }
    activity.record(userId, ActivityType.VAULT_RESET);
  }
}
