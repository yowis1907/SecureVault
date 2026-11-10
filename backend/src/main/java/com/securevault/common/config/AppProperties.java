package com.securevault.common.config;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param publicUrl the address users open, used to build email links. Links never come from the
 *     request's Host header, which a client controls
 * @param mailFrom sender address for outgoing email
 */
@ConfigurationProperties("securevault")
public record AppProperties(URI publicUrl, String mailFrom) {}
