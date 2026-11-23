# SecureVault Security Audit, Phase 6

**Date:** 2026-11-11. **Scope:** the code on `main` after Phase 5, plus the fixes listed here.

**Read this first.** This is a self-review by the same author that wrote the code, helped by automated tests and manual probing. It is not an independent security assessment or a penetration test, and it does not make SecureVault ready to hold real credentials. No compliance with any standard is claimed.

## Result

No open Critical or High findings. One Medium and two Low findings were fixed. The remaining risks are listed under "Accepted and open" with the reason for each.

## What was run

| Check | Result |
|---|---|
| Backend `./mvnw verify` | 13 unit and 91 integration tests pass on PostgreSQL 18, plus the format check |
| Frontend `vitest`, lint, strict types, build | 171 tests pass; lint and types clean |
| End-to-end (Playwright, Edge, full Docker stack) | 3 of 3 pass, including canary scans of traffic, database, and logs |
| `npm audit` | 0 advisories in production dependencies; 10 moderate in development-only tooling (ESLint chain) |
| Frontend coverage of `crypto`, `vault-session`, `lib`, `workers` | Measured before the new tests: 80% of lines. 25 tests were then added for the gaps. Not re-measured afterwards |
| Manual probes against the running stack | See below |

Not run: CodeQL, gitleaks, and the CI workflows (the repository has no GitHub remote yet), and any Maven dependency vulnerability scan.

## Probes against the running stack

| Probe | Outcome |
|---|---|
| 400 KB body sent with chunked encoding, so no declared length | 413 `PAYLOAD_TOO_LARGE` |
| NUL and other control characters in an email | **500 at sign-in before the fix** (finding 1); 400 after |
| Deeply nested JSON, array body, duplicate keys | 400 or the normal 401; no server error |
| `TRACE`, `PATCH`, path traversal, `;jsessionid`, encoded slashes, `%00` | 405, 403, or 400; error pages name no server software |
| Forged `Host` and `X-Forwarded-Host` during registration | The emailed link still used the configured address |
| Registration while the mail server is stopped | 202 as usual; API stays healthy; the log records the failure without the address or link |
| Response times for known and unknown emails (medians of 41, in-process) | Sign-in 41.3 vs 43.7 ms; registration 41.9 vs 45.7 ms; forgot-password 7.0 vs 9.6 ms |

## Findings fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | A NUL character in the sign-in, forgot-password, or resend email reached PostgreSQL, which rejects it, and the API answered 500. Nothing leaked, but unvalidated input reached the database and an attacker could generate server errors at will | Control characters are rejected in every email field. Regression test: `ErrorResponsesIT.controlCharactersInAnEmailAreAValidationErrorNotAServerError` |
| 2 | Low | nginx passed a client's `X-Forwarded-Host` and `X-Forwarded-Port` to the API. No effect was observed, but the API should not see client-chosen values for these | nginx now drops both headers |
| 3 | Low | The record list cursor from the server was placed in a URL without encoding | Encoded with `encodeURIComponent` |

Test gaps closed in this phase: clipboard clearing (delay, restart, clear on lock), refusal of `javascript:`, `data:`, and similar URLs as links, bounds on decrypted settings, category and settings round trips, stale-edit rejection, and authentic ciphertext with invalid contents.

## Accepted and open

| # | Risk | Why it stands |
|---|---|---|
| A | A compromised server can serve modified JavaScript and capture the master password | Inherent to web-delivered cryptography. Stated on the landing page and in the threat model |
| B | Known and unknown emails differ by 2 to 4 ms in response time | Small, and the rate limits make collecting enough samples slow, but it is not zero. Not measured over a network |
| C | The per-email sign-in limit (30 per 15 minutes) lets an attacker temporarily block sign-in for a known address | Trade-off against distributed guessing. It is a throttle, not a lock, and clears by itself |
| D | No `Strict-Transport-Security` header in the nginx config | The stack serves plain HTTP for local use. A real deployment needs TLS termination that adds it. No production deployment exists |
| E | Docker base images are pinned by tag, not digest | Dependabot tracks them; digest pinning was not done |
| F | ~~Trusted Types are not enforced~~ | Closed 2026-11-23: enforced by the CSP with one policy for the worker URL. Verified in Edge locally and in Chromium and Firefox in CI |
| G | The Argon2id cost was measured on one laptop only (223 ms) | No phone was available |
| H | The research paper behind ARCHITECTURE section 5.11 was not read in full | The PDF could not be downloaded on two attempts. The section relies on the abstract and the authors' summary |
| I | Encrypted backup was added on 2026-11-22, after this audit | Tested (see scenario 35), but not part of the Phase 6 review |
| J | The account, settings, and security screens have no component tests of their own | Their logic is unit-tested and they were exercised in a browser |
| K | The `prod` profile was never started | Its startup check is unit-tested only |
| L | Rollback or deletion of records by a malicious server is not detected | Known design limit, scenario 10 |

## Found after the audit

Once the repository was on GitHub and CI ran for the first time (2026-11-22), these turned up:

| # | Severity | Finding | Fix |
|---|---|---|---|
| 4 | Medium | Both CodeQL steps were pinned to `f3bbb05`, under a comment naming v4.39.3. That commit is not in any branch or tag of `github/codeql-action`, and the GitHub API cannot find it there, yet Actions downloaded and ran it with `security-events: write`. The real v4.39.3 is `33d7b85`. The SHA came in with the first commit of the workflow files. Where it came from is not known; most likely it was written by mistake, and nothing checked it. A pinned SHA only helps if it is the reviewed release | Pinned to `33d7b85`. A new CI job, `action-pins`, resolves the tag in each action's own repository and fails if the SHA differs, if the tag does not exist, or if an action is not pinned. It was tested against the old pin, a tag reference, a missing comment, and an unknown tag. The other six pins matched |
| 5 | Low | CodeQL failed on every run because it lacked `actions: read`, and the secret scan failed on every pull request because it lacked `pull-requests: read`. Dependabot pull requests could not pass | Each job now asks for exactly these. On a private repository without code scanning, CodeQL keeps its results as a workflow artifact instead of uploading them |
| 6 | Low | The e2e job did not typecheck or format-check the tests, so a TypeScript upgrade that broke them could pass | Both run before the stack is built |

## Threat model status

Tested means an automated test exercises the mitigation. Reviewed means it was checked by reading or probing, without a dedicated test. Accepted means the risk stands.

| Scenario | Status | Evidence or note |
|---|---|---|
| 1 Offline guessing of the master password | Reviewed | Parameters and salts are tested; a weak password remains guessable |
| 2 Cracking account passwords | Tested | `AuthIT` checks the stored Argon2id format and cost |
| 3 Operator reads vault content | Tested | `e2e/tests/journey.spec.ts` canary scans |
| 4 Session table read from a backup | Accepted | Session IDs are stored unhashed by Spring Session |
| 5 Modified JavaScript | Accepted | Risk A |
| 6 Weakened KDF parameters | Tested | `params.test.ts`, `vault-keys.test.ts`, `RegistrationIT`, `VaultIT`, `SchemaConstraintsIT` |
| 7 Swapped ciphertext | Tested | `records.test.ts` AAD tests |
| 8 Forged record | Tested | Wrong-key and tamper tests in `records.test.ts` |
| 9 Crypto version downgrade | Tested | `params.test.ts`, `records.test.ts`, `vault-keys.test.ts` |
| 10 Rollback or deletion | Accepted | Risk L |
| 11 Settings replaced | Tested | `model.test.ts`, `session.test.ts` |
| 12 Credential stuffing | Tested | `AuthIT` throttling; see risk C |
| 13 Account enumeration | Tested, with residual | `AuthIT`, `RegistrationIT`; risk B |
| 14 CSRF | Tested | `AuthIT` token, Origin, and Fetch Metadata tests |
| 15 Session theft through script | Tested | `AuthIT` asserts `HttpOnly`; XSS could still act while a page is open |
| 16 Session fixation | Tested | `AuthIT.loginReturnsTheUserAndRotatesTheSessionId` |
| 17 Reset link leak | Tested | `RegistrationIT`; logs scanned for links on the stack |
| 18 Host header poisoning | Reviewed | Probed on the stack; no automated test |
| 19 Argon2 as denial of service | Tested | `BoundedPasswordEncoderTest` |
| 20 Stolen session wipes vault or changes keys | Tested | Step-up tests in `VaultIT`, `AccountIT` |
| 21 IDOR | Tested | `IdorIT` |
| 22 Oversized bodies | Tested | `RecordsIT`; chunked bodies probed on the stack only |
| 23 SQL injection | Reviewed | Every statement uses bound parameters; no injection test suite |
| 24 Sensitive error details | Tested | `GlobalExceptionHandlerTest`, `ErrorResponsesIT` |
| 25 Stored XSS through a decrypted field | Tested | `model.test.ts`; a lint rule forbids raw HTML; since 2026-11-23 Trusted Types are enforced and the e2e journey checks that a string at `innerHTML` is refused |
| 26 Script extracts the DEK | Tested, with residual | The key is non-extractable; script in the page could still use it while unlocked |
| 27 Malicious extension or malware | Accepted | Outside what a web app can prevent |
| 28 Walk-away access | Tested | Auto-lock tests in `session.test.ts`; lock in `e2e` |
| 29 Clipboard exposure | Tested, best effort | `clipboard.test.ts`; clipboard history can keep a copy |
| 30 Secrets in memory | Accepted | JavaScript cannot guarantee erasure |
| 31 Favicon or link preview leak | Reviewed | No favicons are fetched; links use `noreferrer` |
| 32 Same password for account and vault | Tested, with residual | `App.test.tsx`; the email reset flow cannot check |
| 33 Master password typed into sign-in | Accepted | Reduced by wording only |
| 34 Forgotten master password | Tested | Vault reset in `VaultIT` |
| 35 Backup passphrase | Tested, with residual | `crypto/backup.test.ts`, `vault-session/backup.test.ts`, `e2e/tests/backup.spec.ts`. A weak passphrase on a leaked file can still be guessed |
| 36 Compromised package | Partly | Lockfiles, exact crypto pin, `npm audit`; no Maven scan |
| 37 Secrets in Git | Partly | `.env` ignored; manual scans before each commit; gitleaks has not run |
| 38 Insecure production settings | Partly | Risk K |
| 39 Session table flooding | Tested | `ApplicationIT`, `AuthIT`, `ErrorResponsesIT` |
