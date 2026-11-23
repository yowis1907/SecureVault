# Changelog

Notable changes to SecureVault. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). No version has been released; everything so far is development on `main`.

## Unreleased

### Added

- **Two-factor sign-in (TOTP).** Turn it on from the Account page with the account password, a QR code, and a first code; save ten one-time recovery codes. Sign-in then needs a code after the password, and no session exists until it is accepted. Codes cannot be reused and are rate-limited; the secret is encrypted at rest under `SECUREVAULT_MFA_KEY`, which the `prod` profile requires. ADR 0015.
- **New interface: light and liquid glass.** Designed in Figma first, in the manner of Apple's interfaces: light neutrals and one blue accent over a soft pastel wallpaper, with frosted, translucent panels (backdrop blur, a bright edge, an inner highlight, and a corner sheen). A floating glass navigation capsule on the landing page, a single glass card for sign-in and unlock, a floating glass sidebar in the app and a floating glass tab bar on phones, iOS-style switches in the generator, and a dark theme with the same materials. The system face is used first, so Apple devices show SF Pro.
- **Firefox end-to-end runs.** CI runs the end-to-end suite in Chromium and Firefox, each against its own stack.
- **Backend dependency scan.** CI lists every runtime Maven dependency with CycloneDX and checks it against the OSV database.
- **Encrypted backup.** Export the vault to a file encrypted with a separate backup passphrase (Argon2id, HKDF label `securevault/v1/backup`, AES-256-GCM with the header authenticated), and import it into any vault under new IDs through the batch endpoint. Plaintext export is not offered.
- **Documentation and screenshots (Phase 7).** README with screenshots captured from the running app, security architecture overview, security policy, contributing guide, license, and this changelog.
- **Security audit (Phase 6).** Self-review with probes against the running stack and a tested, reviewed, or accepted status for each of the 39 threat scenarios. See `docs/SECURITY_AUDIT.md`.
- **End-to-end tests (Phase 5).** Playwright journey against the full Docker stack, with canary scans of network traffic, database rows, and logs; cross-tab locking test.
- **Frontend (Phase 4).** Landing page with a live encryption demo, sign-up wizard, sign-in, email verification, account password reset, unlock, overview, vault, entry editor, password generator, security overview, settings, account, and vault reset. Vault session with auto-lock, cross-tab lock, and clipboard clearing. Light and dark themes.
- **Backend API (Phase 3).** Registration with email verification, account password reset, vault key material, encrypted records with batch import and pagination, sessions, account deletion, activity log, purge jobs, and rate limits.
- **Security foundation (Phase 2).** Browser crypto module: Argon2id in a Web Worker, HKDF, AES-256-GCM key wrapping and record encryption, padding, and associated data. Server sessions, CSRF protection, origin checks, and Argon2id account hashing.
- **Foundation (Phase 1).** Spring Boot and React projects, PostgreSQL schema through Flyway, Docker Compose stack behind nginx with a strict Content Security Policy, and CI workflows.
- **Design (Phase 0).** Architecture and cryptographic specification, threat model, API and database designs, and decision records.

### Security

- Trusted Types are enforced by the CSP. One policy admits the Argon2 worker URL and nothing else; every other script sink refuses strings. Zod runs without its `new Function` optimization.
- The CodeQL action was pinned to a commit that is not part of any `github/codeql-action` release, under a comment naming v4.39.3. It now uses the real v4.39.3 commit, and a new CI job checks that every pinned action SHA matches the release its comment names.
- CI jobs ask only for the permissions they use: CodeQL reads its own run, and secret scanning reads a pull request's commits.
- Control characters in an email no longer reach the database; they are rejected as invalid input.
- nginx drops client-supplied `X-Forwarded-Host` and `X-Forwarded-Port`.
- Master password strength is computed when a form is submitted, not taken from the on-screen meter.
- Master password fields no longer invite the browser to save them.
- Anonymous requests cannot create session rows, apart from the rate-limited CSRF token endpoint.
- Repeated sign-ups cannot flood another person's inbox.
- Changing the account password no longer ends the current session by mistake.

### Known gaps

- See "Accepted and open" in `docs/SECURITY_AUDIT.md`.
