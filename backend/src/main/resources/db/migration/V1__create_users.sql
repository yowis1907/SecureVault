CREATE TABLE users (
    id                  uuid         PRIMARY KEY,
    email               varchar(254) NOT NULL,
    password_hash       varchar(255) NOT NULL,
    email_verified_at   timestamptz,
    password_changed_at timestamptz  NOT NULL,
    created_at          timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL,
    CONSTRAINT users_email_uk UNIQUE (email)
);

-- Supports the job that purges accounts never verified within 24 hours.
CREATE INDEX users_unverified_created_at_idx
    ON users (created_at)
    WHERE email_verified_at IS NULL;
