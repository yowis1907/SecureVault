package com.securevault.account;

import java.time.Instant;
import java.util.UUID;

/** The User object from the API specification. */
public record UserView(UUID id, String email, Instant createdAt) {}
