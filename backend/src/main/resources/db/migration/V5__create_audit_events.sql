-- IP addresses and user agents are deliberately not stored.
CREATE TABLE audit_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL,
    event_type  varchar(40) NOT NULL,
    -- No foreign key: activity history has to outlive the record it mentions.
    record_id   uuid,
    occurred_at timestamptz NOT NULL,
    CONSTRAINT audit_events_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX audit_events_user_occurred_idx ON audit_events (user_id, occurred_at DESC);
CREATE INDEX audit_events_occurred_idx ON audit_events (occurred_at);
