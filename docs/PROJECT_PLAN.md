# SecureVault Project Plan

**Status:** Phases 0 to 6 complete. Phase 7 (polish and final documentation) remains.

Related documents: [Architecture](ARCHITECTURE.md), [Threat model](../THREAT_MODEL.md), [API](API_SPECIFICATION.md), [Database](DATABASE_DESIGN.md).

## 1. Goal

Build a full-stack, zero-knowledge password manager as a serious portfolio project. Success means the security properties are tested and its limits are honestly documented. Success does not mean claiming it is ready to hold real credentials, since it will not have had an independent security assessment.

## 2. Scope

| Priority | Features |
|---|---|
| **Must** | Registration wizard with email verification; login, logout, session expiry; account password change and reset; client-side vault encryption; unlock and auto-lock; entry create, read, update, delete; local search; categories, tags, favorites; password generator; strength analysis; security dashboard; settings and account pages; dark and light themes; responsive layout; all documentation |
| **Should** | Encrypted backup export and import; session list and revocation; secure clipboard clearing |
| **Could** | Cross-tab lock on tab hide; Trusted Types in CSP |
| **Won't, version 1** | Sharing; browser extension; mobile app; two-factor login; full DEK rotation; vault manifest; importing from other managers; passkeys |

## 3. Environment status

Checked on the development machine on 2026-11-08.

| Tool | Found | Needed | Blocks |
|---|---|---|---|
| Node.js | 24.13.0 | 26 LTS recommended, 24.15 minimum | `jsdom` 31 warns on 24.13; CI and Docker use 26 |
| npm | 11.6.2 | Bundled with Node | Nothing |
| Java | **JRE 8 only, no compiler** | JDK 25 | Phase 1 |
| Maven | Missing | None; the Maven Wrapper downloads it | Nothing once a JDK exists |
| Git | **Missing** | Current | Phase 1 |
| Docker | **Missing** | Docker Desktop with WSL 2 | Phase 1; also needed for PostgreSQL and Testcontainers |
| PostgreSQL | Not installed | None; runs in Docker | Nothing once Docker exists |
| GitHub CLI | Missing | Optional | Publishing only |

The existing Java 8 can stay installed. `JAVA_HOME` should point to JDK 25.

## 4. Phases

Every phase ends with real verification, followed by a short report: what was built, what was run, and what you can learn from it. The `code-review` skill runs at the end of each implementation phase.

### Phase 0: Research and planning (this phase)
Deliverables: these documents and the five project skills. **Exit:** your approval of the decisions.

### Phase 1: Foundation
Create the Git repository, Maven Wrapper project, and Vite project with strict TypeScript, ESLint, and Prettier. Set up Docker Compose (`web`, `api`, `db`, `mailpit`), Flyway migrations V1 through V6, `.env.example`, `.gitignore`, the initial GitHub Actions workflow, and the first ADRs.

**Exit:** `./mvnw verify` passes, frontend lint, typecheck, build, and test pass, `docker compose up` shows a healthy stack, and migrations apply.

### Phase 2: Security foundation
Crypto module with tests written first: normalization, Argon2id in a worker, HKDF, DEK generation and wrapping, record encryption, padding, AAD, parameter validation. Backend account hashing, Spring Security, sessions, CSRF, rate limiting. KDF benchmark and the verification items in ARCHITECTURE section 11.

**Exit:** the entire crypto test list in the `test-engineering` skill passes, including cross-implementation Argon2id vectors. Session, CSRF, and throttling integration tests pass.

### Phase 3: Backend
User, registration, email flows, vault, records, activity, account endpoints, central error handling, and purge jobs, all matching the API specification.

**Exit:** integration tests cover every endpoint and error code, and the IDOR suite passes on real PostgreSQL.

### Phase 4: Frontend
Design tokens and primitives, landing page, authentication screens, vault session and locking, vault interface, generator, strength analysis, security dashboard, settings, account pages. Uses MSW against the API contract.

**Exit:** component tests pass; all 12 screens checked in a real browser, both themes, at 375, 768, and 1280 px, with no CSP violations.

### Phase 5: Integration
Remove mocks and connect to the real API. Inspect actual network traffic.

**Exit:** the Playwright journey passes, and canary scanning of request bodies and database rows finds no plaintext.

### Phase 6: Testing and security audit
Run everything. Review authentication, authorization, cryptography, input handling, sessions, dependencies, data exposure, and error handling. Update the threat model with each scenario's tested status. Fix what is found and report what remains.

**Exit:** no open Critical or High findings. Any accepted risk is documented.

### Phase 7: Polish
UI refinement, refactoring, README with real screenshots, SECURITY.md, SECURITY_ARCHITECTURE.md, CONTRIBUTING, CHANGELOG, LICENSE, Docker verification on a clean checkout, CI verification on GitHub, final code review, and the final report.

## 5. Test strategy

Detail is in the `test-engineering` skill. In short: crypto is tested with known-answer vectors, independent implementation checks, and tamper tests; the backend with real PostgreSQL; security behavior with negative tests; and zero-knowledge claims with canary scanning.

## 6. CI pipeline

| Job | Runs |
|---|---|
| Backend | Maven verify, including Testcontainers |
| Frontend | Lint, typecheck, unit tests, build |
| End-to-end | Playwright against Docker Compose |
| Dependencies | `npm audit`, Dependabot, weekly OWASP Dependency-Check (needs a free NVD API key as a GitHub secret) |
| Secrets | gitleaks |
| Static analysis | CodeQL for Java and TypeScript |

## 7. Visual direction

Avoid the common look of purple gradients, floating glass cards, and generic KPI tiles.

**Concept: a precision instrument.** Warm graphite neutrals in dark mode and a paper-like off-white in light mode, with one restrained oxidized-copper accent. Color is reserved for meaning, such as weak, reused, or locked.

- **Signature element:** a persistent lock-state indicator in the app header showing whether the vault is unlocked and how long until it locks. It makes the product's central idea constantly visible.
- **Typography:** a precise grotesque for interface text and a monospace for secrets and generated passwords, with digits and symbols visibly distinct. Fonts are self-hosted, as the CSP blocks external fonts.
- **Density:** the vault is a tight, fast, keyboard-friendly list, closer to a professional tool than a card grid.
- **Motion:** short, functional transitions only, respecting reduced-motion settings.

Final tokens and type choices are made in Phase 4 using the `frontend-design` skill.

## 8. Risks

| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Argon2 parameters too slow on phones | Medium | Medium | Benchmark in Phase 2, before data format is finalized |
| Toolchain incompatibility in very new majors | Medium | Low | Peer ranges were checked; lockfiles; Phase 1 verifies |
| UI libraries conflict with strict CSP | Medium | Medium | Test early in Phase 4; replace the offending component if required |
| Docker on Windows Home has WSL issues | Medium | Medium | Resolve during prerequisite setup |
| Project scope is large | High | Medium | Phased delivery with Must, Should, and Could priorities |
| Spring Boot 4 examples online are outdated | High | Low | Use current official documentation |

## 9. GitHub presentation

**Suggested description:** Zero-knowledge password manager with client-side AES-256-GCM and Argon2id, built with Spring Boot, React, and PostgreSQL. A security-focused engineering project, not independently audited.

**Suggested topics:** `password-manager`, `zero-knowledge`, `end-to-end-encryption`, `aes-gcm`, `argon2`, `web-crypto`, `spring-boot`, `spring-security`, `react`, `typescript`, `postgresql`, `docker`, `threat-modeling`

**License:** MIT, proposed.
