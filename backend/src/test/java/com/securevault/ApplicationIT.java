package com.securevault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.securevault.testsupport.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Starts the full application against a real PostgreSQL container. Requires Docker. */
@IntegrationTest
class ApplicationIT {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void healthIsUpAndRevealsNoDetails() throws Exception {
    mockMvc
        .perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"))
        .andExpect(jsonPath("$.groups", containsInAnyOrder("liveness", "readiness")))
        .andExpect(jsonPath("$", aMapWithSize(2)));
  }

  @Test
  void otherActuatorEndpointsAreNotReachable() throws Exception {
    mockMvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
    mockMvc.perform(get("/actuator/beans")).andExpect(status().isUnauthorized());
  }

  /** Otherwise anyone could grow the session table without logging in. */
  @Test
  void deniedAnonymousGetCreatesNoSession() throws Exception {
    long before = sessionRowCount();

    mockMvc
        .perform(get("/api/v1/anything"))
        .andExpect(status().isUnauthorized())
        .andExpect(header().doesNotExist("Set-Cookie"));

    assertThat(sessionRowCount()).isEqualTo(before);
  }

  private long sessionRowCount() {
    return jdbcTemplate.queryForObject("SELECT count(*) FROM spring_session", Long.class);
  }

  @Test
  void allMigrationsAreApplied() {
    Integer applied =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL",
            Integer.class);
    assertThat(applied).isEqualTo(6);
  }

  @Test
  void runsOnPostgresEighteen() {
    Integer major =
        jdbcTemplate.queryForObject(
            "SELECT current_setting('server_version_num')::int / 10000", Integer.class);
    assertThat(major).isEqualTo(18);
  }
}
