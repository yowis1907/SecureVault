package com.securevault.account;

import java.util.UUID;

/** What login needs to check a password. Kept out of any response. */
public record AccountCredentials(UUID id, String passwordHash, boolean emailVerified) {}
