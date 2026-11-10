# SecureVault API Specification

**Version:** v1 draft (Phase 0). This contract is written before the code. Change this document first when behavior changes.

## Conventions

- **Base path:** `/api/v1`. All bodies are JSON with UTF-8 encoding.
- **Binary fields** use standard base64 (RFC 4648 section 4).
- **Timestamps** are ISO 8601 UTC. **IDs** are UUIDs.
- **Authentication:** session cookie set by login. JavaScript never reads it.
- **CSRF:** every `POST`, `PUT`, `PATCH`, and `DELETE` must include `X-XSRF-TOKEN`. Get the token from `GET /auth/csrf` at startup and again after login and logout.
- **Body limits:** 256 KiB generally, 8 MiB for `POST /vault/records/batch`. A batch of 200 maximum-size records would exceed 8 MiB, so clients split imports by size as well as count.
- **Naming:** `accountPassword` is always the account password. No endpoint accepts a master password or anything derived from one.

## Error format

Errors follow RFC 9457 with `Content-Type: application/problem+json`.

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "traceId": "4f9a1c20b7e34d11",
  "errors": [{ "field": "email", "message": "must be a valid email address" }]
}
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Malformed or out-of-range input |
| 400 | `INVALID_TOKEN` | Expired, used, or unknown email token |
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password, same response for both |
| 403 | `CSRF_REJECTED` | CSRF, Origin, or Fetch Metadata check failed |
| 403 | `EMAIL_NOT_VERIFIED` | Returned only after a correct password |
| 403 | `STEP_UP_FAILED` | Wrong `accountPassword` on a sensitive action |
| 403 | `FORBIDDEN` | Signed in, but the path is not part of the API |
| 404 | `NOT_FOUND` | Does not exist **or** belongs to another user |
| 405 | `METHOD_NOT_ALLOWED` | Known path, unsupported HTTP method |
| 409 | `VERSION_CONFLICT` | Stale `version` or `expectedKeyVersion` |
| 409 | `RECORD_ID_CONFLICT` | Client-generated ID already exists |
| 413 | `PAYLOAD_TOO_LARGE` | Body or record too large |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body is not `application/json` |
| 422 | `QUOTA_EXCEEDED` | More than 5,000 records |
| 429 | `RATE_LIMITED` | Includes `Retry-After` |
| 500 | `INTERNAL_ERROR` | Generic message plus `traceId` |

## Shared objects

**KdfParams**
```json
{ "algorithm": "ARGON2ID", "memoryKib": 65536, "iterations": 3, "parallelism": 1, "salt": "base64 of 16 bytes" }
```
Allowed: `memoryKib` 65536–1048576, `iterations` 3–10, `parallelism` 1–4.

**VaultKeyMaterial**
```json
{
  "vaultId": "uuid",
  "cryptoVersion": 1,
  "kdf": { "...": "KdfParams" },
  "wrappedDek": "base64 of 48 bytes",
  "wrapNonce": "base64 of 12 bytes"
}
```

**VaultRecord**
```json
{
  "id": "uuid",
  "type": "LOGIN",
  "cryptoVersion": 1,
  "nonce": "base64 of 12 bytes",
  "ciphertext": "base64, 16 to 65536 bytes",
  "version": 3,
  "createdAt": "2026-11-08T12:00:00Z",
  "updatedAt": "2026-11-08T12:00:00Z"
}
```
`type` is `LOGIN` or `CATEGORY`.

**User**
```json
{ "id": "uuid", "email": "user@example.com", "createdAt": "2026-11-08T12:00:00Z" }
```

## Authentication

### `GET /auth/csrf`
Public. Returns `200 { "headerName": "X-XSRF-TOKEN", "token": "..." }`.

This is the only request that may create a session for a visitor who is not signed in. That session holds just the token and expires after 10 minutes idle. Any other anonymous request, including a rejected `POST`, creates no session. The token value changes on every call because it is masked with fresh randomness; all values for the same session are valid.

### `POST /auth/register`
Public. Creates the account and vault in one transaction.

```json
{ "email": "user@example.com", "accountPassword": "...", "vault": { "...": "VaultKeyMaterial" } }
```

Always `202` with no body when valid, including when the email is already registered. `accountPassword` is 12 to 128 characters. Email is at most 254 characters, trimmed and lowercased with a locale-independent rule.

### `POST /auth/verify-email`
Public. `{ "token": "..." }`. Returns `204` or `400 INVALID_TOKEN`.

### `POST /auth/verification/resend`
Public. `{ "email": "..." }`. Always `202`.

### `POST /auth/login`
Public. `{ "email": "...", "accountPassword": "..." }`.

`200` returns User and sets a new session cookie. Errors: `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_VERIFIED`, `429`.

The session ID changes at login, and the CSRF token from before login stops working, so the client fetches a new one. `429` is also returned when the server is already running its maximum number of password hashes.

### `POST /auth/logout`
Authenticated. `204`. Destroys the session.

### `GET /auth/me`
Authenticated. `200` User, or `401`.

### `POST /auth/password/forgot`
Public. `{ "email": "..." }`. Always `202`.

### `POST /auth/password/reset`
Public. `{ "token": "...", "newAccountPassword": "..." }`. Returns `204` or `400 INVALID_TOKEN`. Ends all of the user's sessions and sends a notification. Does not log in. Does not touch the vault.

## Account

All require authentication.

### `PUT /account/password`
`{ "currentAccountPassword": "...", "newAccountPassword": "..." }`. Returns `204`, rotates the current session, and ends others. Errors: `403 STEP_UP_FAILED`.

### `GET /account/sessions`
```json
{ "sessions": [{ "handle": "opaque", "createdAt": "...", "lastAccessedAt": "...", "current": true }] }
```
`handle` is a truncated SHA-256 of the session ID. The real session ID is never returned.

### `DELETE /account/sessions/{handle}`
`204`, or `404` when not found or not owned.

### `DELETE /account/sessions`
`204`. Ends all sessions except the current one.

### `POST /account/deletion`
`{ "accountPassword": "...", "confirmation": "DELETE MY ACCOUNT" }`. Returns `204`, removes all user data, and ends sessions. Errors: `403 STEP_UP_FAILED`.

## Vault

All require authentication and apply only to the caller's vault.

### `GET /vault`
```json
{
  "vaultId": "uuid", "cryptoVersion": 1, "kdf": { "...": "KdfParams" },
  "wrappedDek": "...", "wrapNonce": "...",
  "keyVersion": 1,
  "settings": { "nonce": "...", "ciphertext": "..." }
}
```
`settings` is `null` until saved.

### `PUT /vault/key-material`
Replaces the wrapped DEK after a master password change.

```json
{
  "accountPassword": "...",
  "expectedKeyVersion": 1,
  "kdf": { "...": "KdfParams" },
  "wrappedDek": "...",
  "wrapNonce": "..."
}
```
Returns `200 { "keyVersion": 2 }`. Errors: `403 STEP_UP_FAILED`, `409 VERSION_CONFLICT`.

### `PUT /vault/settings`
`{ "nonce": "...", "ciphertext": "..." }`. Returns `204`.

### `POST /vault/reset`
For a forgotten master password. Permanently deletes every record and installs a new vault.

```json
{ "accountPassword": "...", "confirmation": "DELETE MY VAULT", "vault": { "...": "VaultKeyMaterial" } }
```
Returns `204`. Errors: `403 STEP_UP_FAILED`.

## Records

### `GET /vault/records?limit=500&cursor=...`
`limit` is 1 to 1000, default 500. Clients fetch all pages, then search locally.

```json
{ "records": [{ "...": "VaultRecord" }], "nextCursor": "opaque-or-null" }
```

### `POST /vault/records`
```json
{ "id": "client-generated uuid", "type": "LOGIN", "cryptoVersion": 1, "nonce": "...", "ciphertext": "..." }
```
`201` returns VaultRecord with `version` 1. Errors: `409 RECORD_ID_CONFLICT`, `422 QUOTA_EXCEEDED`.

### `POST /vault/records/batch`
`{ "records": [ ... ] }` with at most 200 records. All succeed or none do. Returns `201 { "records": [ ... ] }`.

### `GET /vault/records/{id}`
`200` VaultRecord or `404`.

### `PUT /vault/records/{id}`
```json
{ "version": 3, "cryptoVersion": 1, "nonce": "...", "ciphertext": "..." }
```
`200` returns the updated VaultRecord. Errors: `404`, `409 VERSION_CONFLICT`. `type` cannot change.

### `DELETE /vault/records/{id}`
`204` or `404`.

## Activity

### `GET /activity?limit=50`
`limit` is 1 to 200.

```json
{ "events": [{ "id": 42, "type": "RECORD_UPDATED", "recordId": "uuid-or-null", "occurredAt": "..." }] }
```

Types: `LOGIN_SUCCEEDED`, `ACCOUNT_PASSWORD_CHANGED`, `ACCOUNT_PASSWORD_RESET`, `MASTER_PASSWORD_CHANGED`, `VAULT_RESET`, `SESSION_REVOKED`, `RECORD_CREATED`, `RECORD_UPDATED`, `RECORD_DELETED`, `RECORDS_IMPORTED`.

The client looks up each `recordId` in the decrypted vault to display its title. Vault unlocks never appear here, because unlocking happens entirely in the browser and the server cannot observe it.

## Testing rules derived from this contract

- Every record endpoint has an ownership test with a second user.
- Every error `code` above is produced by at least one test.
- Requests containing an unexpected field fail validation, so plaintext cannot be added by accident. Jackson runs with `FAIL_ON_UNKNOWN_PROPERTIES` enabled for request DTOs.
