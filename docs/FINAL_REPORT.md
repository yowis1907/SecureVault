# SecureVault Final Report

**Date:** 2026-11-11, updated 2026-11-22 for encrypted backup. Covers Phases 0 to 7.

SecureVault is a working zero-knowledge password manager with tested security properties and documented limits. It is not production-ready: it has had no independent security assessment, has never been deployed, and should not hold real credentials.

## What was built

| Area | Delivered |
|---|---|
| Accounts | Registration with email verification, sign-in, sign-out, session expiry, account password change, reset by email |
| Vault setup | Master password setup in the sign-up wizard, kept separate from the account password |
| Encryption | Client-side Argon2id, HKDF, AES-256-GCM key wrapping, whole-entry AES-256-GCM encryption with padding and binding to entry identity |
| Vault | Create, read, update, delete; local search; categories; tags; favorites; notes; websites; usernames and emails; copy to clipboard with clearing |
| Tools | Password generator; local strength analysis; security overview with weak, reused, old, and empty passwords and recent activity |
| Locking | Configurable auto-lock, header countdown, cross-tab lock, lock on session end |
| Account | Session list and sign-out, vault reset, account deletion, settings stored encrypted |
| Backup | Export to a file sealed with a separate backup passphrase; import into any vault under new IDs |
| Interface | 12 required screens plus email-link pages; light and dark themes; phone, tablet, and desktop layouts |
| Server | Spring Boot API with server-side sessions, CSRF protection, origin checks, step-up confirmation, rate limits, uniform error format, purge jobs |
| Operations | Docker Compose stack behind nginx with a strict Content Security Policy; Flyway migrations; CI workflows |
| Documentation | README with real screenshots, security architecture, specification, threat model, audit, API and database documents, 14 decision records, security policy, contributing guide, changelog, license |

## Tests actually run

All on the final code, on a Windows 11 development machine. Last run 2026-11-22, after encrypted backup was added.

| Suite | Command | Result |
|---|---|---|
| Backend unit | `./mvnw verify` | 13 pass |
| Backend integration, PostgreSQL 18 through Testcontainers | `./mvnw verify` | 91 pass |
| Frontend unit and component | `npm test` | 191 pass (2026-11-23) |
| Frontend lint, strict types, format, build | `npm run lint`, `typecheck`, `format:check`, `build` | Pass |
| End-to-end in Edge against the Docker stack | `npx playwright test` | 4 pass |
| End-to-end in Chromium and Firefox, GitHub Actions (2026-11-23) | `PW_BROWSER=firefox npx playwright test` | 4 pass in each |
| Backend dependencies against OSV, GitHub Actions (2026-11-23) | CycloneDX list, then OSV-Scanner | 113 packages, 0 known vulnerabilities |
| Clean clone: no-cache image build, healthy stack, smoke checks, end-to-end | See below | Pass |
| `npm audit`, production dependencies | `npm audit --omit=dev` | 0 advisories |

**Clean-clone check.** The repository was cloned to an empty folder at the Phase 6 commit, `.env.example` was copied to `.env`, images were built with `--no-cache`, and all four services became healthy. The smoke checks and the end-to-end suite passed against that stack. The documentation and small cleanups made afterwards in Phase 7 were not part of that clone; they were covered by the final run of every suite in the working folder.

Cross-implementation check for Argon2id: Bouncy Castle, `hash-wasm`, and `@noble/hashes` produce identical output for shared test vectors.

## Not run or not verified

- **Argon2id cost on a phone.** Measured on one laptop only: 223 ms median, 237 ms again on 2026-11-23 under the Trusted Types CSP. Chromium's CPU throttling was tried as a stand-in and does not reach the worker (1x, 4x, and 6x all gave about 215 ms), so it gives no estimate. The benchmark page needs no secure context, so it can be opened on a phone over the local network with `npx vite preview --mode benchmark --host`.
- **Timing differences over a network.** Measured in-process: 2 to 4 ms between known and unknown emails.
- **The `prod` profile was never started.** Its startup safety check is unit-tested.
- **The research paper** behind specification section 5.11 was not read in full; the PDF could not be downloaded.
- **Safari.** Chromium-based browsers and Firefox run the end-to-end suite; Safari was not tested.
- **Screen readers.** Accessibility was built in (labels, focus, live regions, keyboard paths) but not tested with assistive technology.
- **Coverage after the last tests were added** was not re-measured. Before them it was 80% of lines in the crypto, session, and library code.

## Not built

- By design for version 1: sharing, passkeys, browser extension, mobile app, data-key rotation, importing from other managers.

## Limitations

- A compromised server can send modified JavaScript and capture the master password. This cannot be fixed in a web-delivered app.
- Script running in the page while the vault is unlocked, malware, and malicious extensions can read what the user can.
- A weak master password can be guessed offline after a database theft.
- A malicious server can roll back or delete entries without detection.
- The server sees the email address, entry count, size buckets, and timing.
- A forgotten master password means a lost vault.
- JavaScript cannot guarantee that secrets are erased from memory, and clipboard clearing is best effort.
- Rate limits live in memory, so they are per server instance and reset on restart.
- Changing the master password does not change the data key. An attacker with an old copy of the vault and the old master password could still open that copy.

## Risks accepted

Listed with reasons in [SECURITY_AUDIT.md](SECURITY_AUDIT.md), section "Accepted and open". The ones most worth weighing before any real use:

1. The audit was a self-review by the author of the code.
2. The per-email sign-in limit lets an attacker temporarily block sign-in for a known address.
3. Spring Session stores session IDs unhashed, so a leaked session table exposes live sessions until they expire.
4. No HTTPS configuration exists; a deployment would have to add TLS and `Strict-Transport-Security`.
5. Docker base images are pinned by tag, not digest.

## Defects found and fixed along the way

Each has a regression test unless noted.

| Phase | Defect |
|---|---|
| 1 | Every denied anonymous request created a session row |
| 2 | Unlock crashed when the password buffer had been transferred to the worker |
| 2 | Tests checked a default cookie, not the hardened one production sends |
| 3 | Changing the account password signed the user out of the current session |
| 3 | A mail outage would have marked the whole API unhealthy |
| 3 | Repeated sign-ups could flood another person's inbox |
| 4 | The master password strength check could pass on a stale result |
| 4 | Master password fields invited the browser to save them |
| 6 | A NUL character in an email caused a server error |
| 7 | The CI smoke test expected the wrong status code (no automated test; found on the clean-clone check) |

## Before using this for anything real

1. Commission an independent security review of the cryptography and the server.
2. Deploy behind TLS with the `prod` profile, HSTS, and real SMTP, and re-run the end-to-end suite there.
3. Benchmark Argon2id on phones and adjust if unlock is too slow.
4. Get an independent review of the backup format too: it was added after the Phase 6 self-review.
