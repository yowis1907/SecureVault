package com.securevault.vault;

import com.securevault.vault.VaultDtos.BatchRequest;
import com.securevault.vault.VaultDtos.EncryptedSettings;
import com.securevault.vault.VaultDtos.KeyMaterialUpdate;
import com.securevault.vault.VaultDtos.KeyVersionResponse;
import com.securevault.vault.VaultDtos.NewRecord;
import com.securevault.vault.VaultDtos.RecordList;
import com.securevault.vault.VaultDtos.RecordPage;
import com.securevault.vault.VaultDtos.RecordUpdate;
import com.securevault.vault.VaultDtos.VaultRecord;
import com.securevault.vault.VaultDtos.VaultResetRequest;
import com.securevault.vault.VaultDtos.VaultResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The user is always taken from the session, never from the request, so no ID can be spoofed. */
@RestController
@RequestMapping("/api/v1/vault")
class VaultController {

  private final VaultService vaults;
  private final RecordService records;

  VaultController(VaultService vaults, RecordService records) {
    this.vaults = vaults;
    this.records = records;
  }

  @GetMapping
  VaultResponse vault(Authentication authentication) {
    return vaults.get(userId(authentication));
  }

  @PutMapping("/key-material")
  KeyVersionResponse replaceKeyMaterial(
      Authentication authentication, @Valid @RequestBody KeyMaterialUpdate body) {
    return new KeyVersionResponse(vaults.replaceKeyMaterial(userId(authentication), body));
  }

  @PutMapping("/settings")
  ResponseEntity<Void> replaceSettings(
      Authentication authentication, @Valid @RequestBody EncryptedSettings body) {
    vaults.replaceSettings(userId(authentication), body);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/reset")
  ResponseEntity<Void> reset(
      Authentication authentication, @Valid @RequestBody VaultResetRequest body) {
    vaults.reset(userId(authentication), body.accountPassword(), body.vault());
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/records")
  RecordPage records(
      Authentication authentication,
      @RequestParam(defaultValue = "500") @Min(1) @Max(1000) int limit,
      @RequestParam(required = false) UUID cursor) {
    return records.page(userId(authentication), cursor, limit);
  }

  @PostMapping("/records")
  ResponseEntity<VaultRecord> create(
      Authentication authentication, @Valid @RequestBody NewRecord body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(records.create(userId(authentication), body));
  }

  @PostMapping("/records/batch")
  ResponseEntity<RecordList> createBatch(
      Authentication authentication, @Valid @RequestBody BatchRequest body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(new RecordList(records.createBatch(userId(authentication), body.records())));
  }

  @GetMapping("/records/{id}")
  VaultRecord record(Authentication authentication, @PathVariable UUID id) {
    return records.get(userId(authentication), id);
  }

  @PutMapping("/records/{id}")
  VaultRecord update(
      Authentication authentication, @PathVariable UUID id, @Valid @RequestBody RecordUpdate body) {
    return records.update(userId(authentication), id, body);
  }

  @DeleteMapping("/records/{id}")
  ResponseEntity<Void> delete(Authentication authentication, @PathVariable UUID id) {
    records.delete(userId(authentication), id);
    return ResponseEntity.noContent().build();
  }

  private static UUID userId(Authentication authentication) {
    return UUID.fromString(authentication.getName());
  }
}
