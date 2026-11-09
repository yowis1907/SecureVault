---
name: backend-engineering
description: Use when writing or changing SecureVault backend code, including Spring Boot controllers, services, JPA entities, Spring Security configuration, Flyway migrations, validation, or REST error handling under backend/.
---

# Backend Engineering for SecureVault

Stack: Java 25, Spring Boot 4.1, Spring Security 7.1, Spring Data JPA with Hibernate 7, PostgreSQL 18, Flyway, Maven Wrapper. Let the Spring Boot BOM manage versions. Add an explicit version only for libraries the BOM does not cover.

The contracts are `docs/API_SPECIFICATION.md` and `docs/DATABASE_DESIGN.md`. Update the contract first when behavior changes.

## Structure

Package by feature, with layers inside each feature:

```
com.securevault
├── auth/       controller, service, dto, ...
├── account/
├── vault/
├── activity/
├── mail/
└── common/     config, security, error, ratelimit
```

Dependency direction: controller -> service -> repository -> entity. Features talk to each other through services, never through another feature's repository.

## Rules

- Controllers handle HTTP only: bind, validate, call one service method, map the response. They hold no business logic and never touch a repository.
- Services own transactions (`@Transactional`) and business rules.
- Never return or accept a JPA entity at the API. Use Java `record` DTOs.
- Put Bean Validation on every request DTO and use `@Valid` at the controller. Enforce the same constraints again in the database where practical.
- Use constructor injection only.
- Every record lookup is by ID **and** owner, for example `findByIdAndUserId`. A record owned by someone else returns 404, not 403, so the API does not confirm it exists.
- The server treats ciphertext as opaque bytes. It validates only encoding, nonce length, and size limits.
- All errors go through one `@RestControllerAdvice` and use RFC 9457 `ProblemDetail` with the `code` values from the API spec. Never expose stack traces, SQL, or internal class names.
- Schema changes happen only through new Flyway migrations. Never edit a migration that has been merged. `spring.jpa.hibernate.ddl-auto` is `validate`.
- Configuration comes from the environment. The `prod` profile must fail at startup if a required secure setting is missing.
- Logs never include passwords, tokens, session IDs, ciphertext, or request bodies. Log a user UUID rather than an email address.

## Spring Security specifics

- CSRF uses the session-backed `HttpSessionCsrfTokenRepository` and the default XOR handler, with the token served by `GET /api/v1/auth/csrf`. Do not use `csrf.spa()` or cookie-based tokens, because OWASP discourages unsigned double-submit cookies.
- Construct `Argon2PasswordEncoder` with explicit parameters from the spec. `defaultsForSpringSecurity_v5_8()` uses 16 MiB, which is below OWASP's current minimum.
- Argon2 is memory heavy. All hashing goes through a bounded executor so that a login flood cannot exhaust the heap.
- On unknown email, still perform a hash so that timing does not reveal account existence.

Check current official documentation for any Spring API you are not certain of. Spring Boot 4 moved many starters and packages compared with older tutorials.

## Checklist before calling a backend task done

- [ ] DTOs are used on both sides of the API, and validation is present
- [ ] Ownership check exists and has a test using a second user
- [ ] Error path returns the documented `code` and status
- [ ] Migration applies cleanly on an empty database via Testcontainers
- [ ] No sensitive value is reachable by a log statement
- [ ] `./mvnw verify` was actually run and passed

## Expected output

Say briefly what the feature's role is, list the files changed, and report the exact verification command and result. Explain one Spring or Java concept the change relies on when it is genuinely instructive for a student reader.
