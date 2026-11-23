package com.securevault.mfa;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Two-factor settings for the signed-in account. Sign-in with a code is in AuthController. */
@RestController
@RequestMapping("/api/v1/account/mfa")
class MfaController {

  record PasswordRequest(@NotEmpty @Size(max = 128) String accountPassword) {
    @Override
    public String toString() {
      return "PasswordRequest[<redacted>]";
    }
  }

  record CodeRequest(@NotNull @Size(min = 6, max = 32) String code) {
    @Override
    public String toString() {
      return "CodeRequest[<redacted>]";
    }
  }

  record DisableRequest(
      @NotEmpty @Size(max = 128) String accountPassword,
      @NotNull @Size(min = 6, max = 32) String code) {
    @Override
    public String toString() {
      return "DisableRequest[<redacted>]";
    }
  }

  record RecoveryCodesResponse(List<String> recoveryCodes) {
    @Override
    public String toString() {
      return "RecoveryCodesResponse[<redacted>]";
    }
  }

  private final MfaService mfa;

  MfaController(MfaService mfa) {
    this.mfa = mfa;
  }

  @GetMapping
  MfaService.Status status(Authentication authentication) {
    return mfa.status(userId(authentication));
  }

  /** The secret is shown once, for the authenticator app to store. */
  @PostMapping("/setup")
  MfaService.Setup setup(Authentication authentication, @Valid @RequestBody PasswordRequest body) {
    return mfa.beginSetup(userId(authentication), body.accountPassword());
  }

  @PostMapping("/enable")
  RecoveryCodesResponse enable(
      Authentication authentication, @Valid @RequestBody CodeRequest body) {
    return new RecoveryCodesResponse(mfa.confirmSetup(userId(authentication), body.code()));
  }

  @PostMapping("/disable")
  ResponseEntity<Void> disable(
      Authentication authentication, @Valid @RequestBody DisableRequest body) {
    mfa.disable(userId(authentication), body.accountPassword(), body.code());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/recovery-codes")
  RecoveryCodesResponse regenerate(
      Authentication authentication, @Valid @RequestBody PasswordRequest body) {
    return new RecoveryCodesResponse(
        mfa.regenerateRecoveryCodes(userId(authentication), body.accountPassword()));
  }

  private static UUID userId(Authentication authentication) {
    return UUID.fromString(authentication.getName());
  }
}
