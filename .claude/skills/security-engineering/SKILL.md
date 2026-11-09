---
name: security-engineering
description: Use when designing, changing, or reviewing anything in SecureVault that touches cryptography, key management, the master or account password, sessions, CSRF, rate limiting, the zero-knowledge boundary, threat modeling, or handling of sensitive data. Also use before changing docs/ARCHITECTURE.md section 5 or THREAT_MODEL.md.
---

# Security Engineering for SecureVault

The cryptographic specification lives in `docs/ARCHITECTURE.md` section 5. The attack analysis lives in `THREAT_MODEL.md`. Read the relevant section before making a change. If the code and the spec disagree, stop and resolve it. Never quietly pick one.

## Non-negotiable invariants

1. The master password, the KEK, the DEK, and decrypted record contents never leave the browser.
2. The server stores only ciphertext, wrapped keys, and non-secret KDF parameters.
3. Every vault secret (title, username, URL, notes, category, tags, favorite flag) lives inside one AES-256-GCM blob per record. Never add a plaintext column for vault content. Never encrypt fields separately.
4. Every AES-GCM call passes the AAD string defined in the spec, and that AAD binds the ciphertext to its identity.
5. Every encryption uses a fresh 96-bit nonce from `crypto.getRandomValues`.
6. The client validates KDF parameters against its built-in floor and ceiling before deriving. It never trusts server-supplied parameters alone.
7. There is no master password recovery, reset, escrow, or server-held recovery key.
8. There is no fallback to an older or weaker crypto version. Unknown `cryptoVersion` values are a hard error.

## Forbidden

- MD5, SHA-1, or a bare SHA-256 for passwords. ECB or CBC modes. `Math.random()` for anything security related.
- Hand-written primitives. Use Web Crypto for AES-GCM and HKDF, `hash-wasm` for Argon2id in the browser, and Bouncy Castle through Spring Security on the server.
- Hardcoded keys, secrets, salts, or nonces outside of tests.
- Tokens or keys in `localStorage`, `sessionStorage`, IndexedDB, URLs, or logs.
- `spring.security` debug logging or request-body logging in any shipped profile.
- Claims such as "unhackable", "production-secure", "OWASP compliant", or "memory is wiped".

## Workflow for a security-relevant change

1. State the asset being protected and the attacker considered (see the actors in `THREAT_MODEL.md`).
2. Check whether the change crosses a trust boundary or alters what the server can see.
3. Compare against the matching OWASP Cheat Sheet. Read the current page. Do not rely on memory.
4. If there are real alternatives with security consequences, write them down with a justified choice and record an ADR in `docs/adr/`.
5. Write the failing or negative test first: wrong key, tampered data, another user's ID, expired token.
6. Update `THREAT_MODEL.md` if a mitigation or residual risk changed.

## Review checklist

**Cryptography**
- [ ] AAD is present and matches the spec, including type and IDs
- [ ] Nonce length is exactly 12 bytes and is freshly generated per encryption
- [ ] The tag is 128 bits
- [ ] KDF parameters are range-checked on client and server
- [ ] The DEK is imported non-extractable, except briefly during a master password change
- [ ] Master password input is NFKC-normalized before UTF-8 encoding

**Zero-knowledge boundary**
- [ ] No new request field can carry plaintext vault data
- [ ] TanStack Query caches ciphertext DTOs only, and decrypted data stays in the vault store
- [ ] Lock clears the DEK reference, the decrypted store, and pending clipboard timers
- [ ] A canary string in a test entry never appears in network traffic or database rows

**Server**
- [ ] Every record query is scoped by the authenticated user's ID, and foreign IDs return 404
- [ ] Sensitive operations require step-up with the account password
- [ ] State-changing requests are CSRF protected
- [ ] Auth endpoints are rate limited, and responses do not reveal whether an account exists
- [ ] Sessions rotate at login and are invalidated on logout and password change
- [ ] No secret appears in logs, exceptions, or error bodies

## Expected output

For a design task: the asset, the attacker, the options, the decision, the residual risk.

For a review: findings ordered by severity, each with the file and line, a concrete attack scenario, and a specific fix. If there are no findings, say which checklist areas were actually examined.
