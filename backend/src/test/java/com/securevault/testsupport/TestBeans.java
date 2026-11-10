package com.securevault.testsupport;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class TestBeans {

  @Bean
  @Primary
  MutableClock testClock() {
    return new MutableClock();
  }

  @Bean
  @Primary
  RecordingMailer recordingMailer() {
    return new RecordingMailer();
  }
}
