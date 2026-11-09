package com.securevault.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** Runs the real security filter chain without a database, so it does not need Docker. */
@WebMvcTest
@Import(SecurityConfig.class)
class SecurityConfigTest {

  @Autowired private MockMvc mockMvc;

  @Test
  void unknownGetIsForbidden() throws Exception {
    mockMvc.perform(get("/api/v1/anything")).andExpect(status().isForbidden());
  }

  @Test
  void unknownPostIsForbidden() throws Exception {
    mockMvc.perform(post("/api/v1/anything")).andExpect(status().isForbidden());
  }

  @Test
  void loginFormIsDisabled() throws Exception {
    mockMvc.perform(get("/login")).andExpect(status().isForbidden());
  }
}
