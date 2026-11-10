package com.securevault.testsupport;

import com.securevault.TestcontainersConfiguration;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

/**
 * The full application on a real PostgreSQL container. Every class using this annotation shares one
 * Spring context, and so one container, because their configuration is identical.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, TestBeans.class})
public @interface IntegrationTest {}
