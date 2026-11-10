package com.securevault.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Async lets email go out after the response, so response time does not reveal whether an email was
 * sent, which would reveal whether an account exists. Scheduling runs the purge jobs.
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableScheduling
class AsyncConfig {}
