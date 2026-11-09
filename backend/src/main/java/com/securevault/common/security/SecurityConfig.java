package com.securevault.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Closed-by-default baseline: only the health check is reachable. Authentication, sessions and CSRF
 * rules for the real API are added on top of this in Phase 2.
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http.authorizeHttpRequests(requests ->
            requests
                .requestMatchers("/actuator/health", "/actuator/health/**")
                .permitAll()
                .anyRequest()
                .denyAll())
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        // A JSON API has no login page to return to. Left on, this stores a new session for every
        // denied anonymous request.
        .requestCache(AbstractHttpConfigurer::disable)
        .build();
  }
}
