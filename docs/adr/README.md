# Architecture Decision Records

An ADR captures one significant decision: the situation, the choice, and what it costs. Accepted ADRs are not rewritten. A later decision replaces an earlier one with a new record that says so.

| # | Decision | Status |
|---|---|---|
| [0001](0001-encrypt-whole-records.md) | Encrypt whole records as one blob | Accepted |
| [0002](0002-wrapped-data-encryption-key.md) | Wrap a random data encryption key | Accepted |
| [0003](0003-no-master-password-verifier.md) | No master password verifier on the server | Accepted |
| [0004](0004-server-side-sessions.md) | Server-side sessions instead of JWT | Accepted |
| [0005](0005-session-stored-csrf-token.md) | Session-stored CSRF token | Accepted |
| [0006](0006-same-origin-hosting.md) | Same-origin hosting | Accepted |
| [0007](0007-client-generated-record-ids.md) | Client-generated record IDs | Accepted |
| [0008](0008-combined-registration-wizard.md) | Combined registration wizard | Accepted |
| [0009](0009-single-records-table.md) | One table for all record types | Accepted |
| [0010](0010-encrypted-settings.md) | Store vault settings encrypted | Accepted |
| [0011](0011-required-email-verification.md) | Require email verification | Accepted |
| [0012](0012-contract-first-api.md) | Hand-written API contract first | Accepted |
| [0013](0013-explicit-sql-for-conditional-writes.md) | Explicit SQL for records, vault keys, tokens, and activity | Accepted |
| [0014](0014-native-elements-instead-of-radix.md) | Native HTML elements instead of Radix and shadcn/ui | Accepted |
| [0015](0015-totp-two-factor-sign-in.md) | TOTP two-factor sign-in, with the secret encrypted under a server key | Accepted |
