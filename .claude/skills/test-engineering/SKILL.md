---
name: test-engineering
description: Use when writing, running, or analyzing SecureVault tests, including JUnit and Testcontainers backend tests, Vitest and React Testing Library frontend tests, Playwright end-to-end tests, cryptographic test vectors, security regression tests, or coverage analysis.
---

# Test Engineering for SecureVault

A feature is not finished because it compiles. Tests must be executed, and only executed results may be reported. A failing test is reported with its output. Never skip, disable, or weaken a test to get a green build. If a test is truly wrong, explain why and fix the test in a separate, visible step.

## Where tests belong

| Level | Tools | Covers |
|---|---|---|
| Crypto unit | Vitest | Everything in `frontend/src/crypto` |
| Frontend component | Vitest, React Testing Library, MSW | Forms, states, lock behavior |
| Backend unit | JUnit 5, Mockito | Service rules and validators |
| Backend integration | Spring Boot Test, Testcontainers | Security filters, persistence, migrations |
| End-to-end | Playwright | Full user journeys in a real browser |

Use a real PostgreSQL through Testcontainers for integration tests. Do not substitute H2, because its behavior differs from PostgreSQL. Do not mock the code under test. Mock only external boundaries such as email.

## Required cryptographic tests

- [ ] Encrypt then decrypt returns the original for ASCII, Unicode, and empty and maximum-length values
- [ ] Wrong master password fails with the generic unlock error
- [ ] A flipped bit in ciphertext, tag, nonce, or wrapped DEK makes decryption fail
- [ ] Changed AAD (other record ID, type, or vault ID) makes decryption fail
- [ ] Nonces and salts are unique over many generations
- [ ] KDF parameters below the floor or above the ceiling are rejected before any derivation
- [ ] Unknown `cryptoVersion` is rejected
- [ ] Master password change: the new one unlocks, the old one fails, and records still decrypt
- [ ] Wrap then unwrap returns a working key, and the session DEK is non-extractable
- [ ] Known-answer vectors: RFC 5869 for HKDF, and published AES-256-GCM vectors
- [ ] Argon2id is cross-checked against an independent implementation: Bouncy Castle-generated vectors and `@noble/hashes`. RFC 9106's sample vector uses associated data, which `hash-wasm` does not expose, so it cannot be applied directly

## Required backend tests

Registration, login, logout, session expiry, session rotation, account password hashing format, CSRF rejection, validation failures, rate limit responses, error body shape, encrypted payload round trip, step-up failure, and account enumeration resistance.

**IDOR suite:** for every record endpoint, user B attempts access to user A's record and must get 404 with A's data unchanged.

## End-to-end journey

Register, set master password, log in, unlock, create an entry, refresh, unlock again, retrieve, edit, delete, log out.

**Zero-knowledge verification:** use unique canary strings for the master password and every entry field. Capture every request body, then query the database directly. Assert that no canary appears anywhere.

## Test data

Never use real credentials. Generate data per test so tests stay independent. Tests must be deterministic: no fixed sleeps. Use Playwright's auto-waiting and explicit conditions.

## Regression rule

Each fixed bug gets a test that failed before the fix.

## Coverage

Coverage is a tool for finding untested code, not a goal in itself. Aim for near-complete branch coverage in `frontend/src/crypto` and backend security code. Read uncovered lines instead of adding tests just to raise the number.

## Expected output

The exact commands run, passed/failed/skipped counts from real output, failure details, what was not tested and why, and any coverage figures taken from real reports.
