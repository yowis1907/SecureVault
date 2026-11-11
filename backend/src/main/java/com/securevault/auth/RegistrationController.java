package com.securevault.auth;

import com.securevault.vault.VaultDtos.VaultKeyMaterial;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public endpoints. Every response is identical whether or not the email has an account. */
@RestController
@RequestMapping("/api/v1/auth")
class RegistrationController {

  record RegisterRequest(
      @NotBlank @Size(max = 254) @Email @Pattern(regexp = "[^\\p{Cntrl}]*") String email,
      @NotNull @Size(min = 12, max = 128) String accountPassword,
      @NotNull @Valid VaultKeyMaterial vault) {
    @Override
    public String toString() {
      return "RegisterRequest[<redacted>]";
    }
  }

  record TokenRequest(@NotBlank @Size(max = 100) String token) {
    @Override
    public String toString() {
      return "TokenRequest[<redacted>]";
    }
  }

  record EmailRequest(@NotBlank @Size(max = 254) @Pattern(regexp = "[^\\p{Cntrl}]*") String email) {
    @Override
    public String toString() {
      return "EmailRequest[<redacted>]";
    }
  }

  record ResetRequest(
      @NotBlank @Size(max = 100) String token,
      @NotNull @Size(min = 12, max = 128) String newAccountPassword) {
    @Override
    public String toString() {
      return "ResetRequest[<redacted>]";
    }
  }

  private final RegistrationService registration;

  RegistrationController(RegistrationService registration) {
    this.registration = registration;
  }

  @PostMapping("/register")
  ResponseEntity<Void> register(
      @Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
    registration.register(
        body.email(), body.accountPassword(), body.vault(), request.getRemoteAddr());
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/verify-email")
  ResponseEntity<Void> verifyEmail(
      @Valid @RequestBody TokenRequest body, HttpServletRequest request) {
    registration.verifyEmail(body.token(), request.getRemoteAddr());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/verification/resend")
  ResponseEntity<Void> resend(@Valid @RequestBody EmailRequest body, HttpServletRequest request) {
    registration.resendVerification(body.email(), request.getRemoteAddr());
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/password/forgot")
  ResponseEntity<Void> forgot(@Valid @RequestBody EmailRequest body, HttpServletRequest request) {
    registration.forgotPassword(body.email(), request.getRemoteAddr());
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/password/reset")
  ResponseEntity<Void> reset(@Valid @RequestBody ResetRequest body, HttpServletRequest request) {
    registration.resetPassword(body.token(), body.newAccountPassword(), request.getRemoteAddr());
    return ResponseEntity.noContent().build();
  }
}
