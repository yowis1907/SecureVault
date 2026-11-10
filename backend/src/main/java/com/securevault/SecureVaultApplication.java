package com.securevault;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

// The excluded auto-configuration would create a default user and print its password to the log.
// SecureVault has no UserDetailsService: AuthService checks account passwords itself.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class SecureVaultApplication {

  public static void main(String[] args) {
    SpringApplication.run(SecureVaultApplication.class, args);
  }
}
