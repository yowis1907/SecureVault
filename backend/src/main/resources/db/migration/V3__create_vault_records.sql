-- No column here may ever hold plaintext vault content. Titles, URLs, categories,
-- tags and favorites all live inside the ciphertext.
CREATE TABLE vault_records (
    id             uuid        PRIMARY KEY,
    user_id        uuid        NOT NULL,
    record_type    varchar(16) NOT NULL,
    crypto_version smallint    NOT NULL,
    nonce          bytea       NOT NULL,
    ciphertext     bytea       NOT NULL,
    version        bigint      NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL,
    CONSTRAINT vault_records_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT vault_records_type_ck CHECK (record_type IN ('LOGIN', 'CATEGORY')),
    CONSTRAINT vault_records_crypto_version_ck CHECK (crypto_version = 1),
    CONSTRAINT vault_records_nonce_ck CHECK (octet_length(nonce) = 12),
    CONSTRAINT vault_records_ciphertext_ck CHECK (octet_length(ciphertext) BETWEEN 16 AND 65536),
    CONSTRAINT vault_records_version_ck CHECK (version >= 1)
);

-- Owner-scoped lookups and keyset pagination.
CREATE INDEX vault_records_user_id_idx ON vault_records (user_id, id);
