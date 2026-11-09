package com.securevault;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

// The excluded auto-configuration would create a default user and print its password to the log.
// Real users arrive with a real UserDetailsService in Phase 2, which also makes this unnecessary.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class SecureVaultApplication {

  public static void main(String[] args) {
    SpringApplication.run(SecureVaultApplication.class, args);
  }
}
