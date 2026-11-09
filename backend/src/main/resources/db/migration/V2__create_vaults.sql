-- Everything a browser needs to unlock a vault. Nothing here can decrypt it
-- without the user's master password.
CREATE TABLE vaults (
    id                  uuid        PRIMARY KEY,
    user_id             uuid        NOT NULL,
    crypto_version      smallint    NOT NULL,
    kdf_algorithm       varchar(16) NOT NULL,
    kdf_memory_kib      integer     NOT NULL,
    kdf_iterations      integer     NOT NULL,
    kdf_parallelism     integer     NOT NULL,
    kdf_salt            bytea       NOT NULL,
    wrapped_dek         bytea       NOT NULL,
    wrap_nonce          bytea       NOT NULL,
    settings_ciphertext bytea,
    settings_nonce      bytea,
    key_version         integer     NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL,
    CONSTRAINT vaults_user_uk UNIQUE (user_id),
    CONSTRAINT vaults_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT vaults_crypto_version_ck CHECK (crypto_version = 1),
    CONSTRAINT vaults_kdf_algorithm_ck CHECK (kdf_algorithm = 'ARGON2ID'),
    CONSTRAINT vaults_kdf_memory_ck CHECK (kdf_memory_kib BETWEEN 65536 AND 1048576),
    CONSTRAINT vaults_kdf_iterations_ck CHECK (kdf_iterations BETWEEN 3 AND 10),
    CONSTRAINT vaults_kdf_parallelism_ck CHECK (kdf_parallelism BETWEEN 1 AND 4),
    CONSTRAINT vaults_kdf_salt_ck CHECK (octet_length(kdf_salt) = 16),
    -- A 32-byte key plus the 16-byte GCM tag.
    CONSTRAINT vaults_wrapped_dek_ck CHECK (octet_length(wrapped_dek) = 48),
    CONSTRAINT vaults_wrap_nonce_ck CHECK (octet_length(wrap_nonce) = 12),
    CONSTRAINT vaults_key_version_ck CHECK (key_version >= 1),
    CONSTRAINT vaults_settings_pair_ck CHECK (
        (settings_ciphertext IS NULL AND settings_nonce IS NULL)
        OR (settings_ciphertext IS NOT NULL AND settings_nonce IS NOT NULL)
    ),
    CONSTRAINT vaults_settings_size_ck CHECK (
        settings_ciphertext IS NULL OR octet_length(settings_ciphertext) BETWEEN 16 AND 8192
    ),
    CONSTRAINT vaults_settings_nonce_ck CHECK (
        settings_nonce IS NULL OR octet_length(settings_nonce) = 12
    )
);
