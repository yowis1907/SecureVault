-- Two-factor sign-in with TOTP (ADR 0015).
--
-- The shared secret is stored encrypted with AES-256-GCM under a server key that lives in the
-- environment, not in the database, so a copy of the database alone cannot produce codes.
-- A row with enabled_at NULL is a setup the user has started but not yet confirmed.
CREATE TABLE user_mfa (
    user_id           uuid        PRIMARY KEY,
    secret_ciphertext bytea       NOT NULL,
    secret_nonce      bytea       NOT NULL,
    enabled_at        timestamptz,
    -- The 30-second step of the last accepted code, so the same code cannot be used twice.
    last_used_step    bigint,
    created_at        timestamptz NOT NULL,
    CONSTRAINT user_mfa_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT user_mfa_nonce_length CHECK (octet_length(secret_nonce) = 12),
    -- A 20-byte secret plus the 16-byte GCM tag.
    CONSTRAINT user_mfa_secret_length CHECK (octet_length(secret_ciphertext) = 36)
);

-- One-time recovery codes, stored only as SHA-256 hashes. They are random, not chosen by a
-- person, so a fast hash is right (as for one_time_tokens).
CREATE TABLE mfa_recovery_codes (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL,
    code_hash  bytea       NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT mfa_recovery_codes_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT mfa_recovery_codes_hash_length CHECK (octet_length(code_hash) = 32),
    CONSTRAINT mfa_recovery_codes_hash_unique UNIQUE (user_id, code_hash)
);

CREATE INDEX mfa_recovery_codes_user_idx ON mfa_recovery_codes (user_id);
