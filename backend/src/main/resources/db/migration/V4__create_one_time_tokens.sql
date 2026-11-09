-- Email verification and password reset tokens. Only the SHA-256 of each token
-- is stored. The raw token exists solely in the email that was sent.
CREATE TABLE one_time_tokens (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL,
    purpose     varchar(24) NOT NULL,
    token_hash  bytea       NOT NULL,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL,
    CONSTRAINT one_time_tokens_hash_uk UNIQUE (token_hash),
    CONSTRAINT one_time_tokens_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT one_time_tokens_purpose_ck CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
    CONSTRAINT one_time_tokens_hash_size_ck CHECK (octet_length(token_hash) = 32)
);

CREATE INDEX one_time_tokens_user_purpose_idx ON one_time_tokens (user_id, purpose);
CREATE INDEX one_time_tokens_expires_at_idx ON one_time_tokens (expires_at);
