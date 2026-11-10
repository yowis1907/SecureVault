# 0013. Explicit SQL for records, vault keys, tokens, and activity

**Status:** Accepted, 2026-11-10

## Context
The stack includes Spring Data JPA and Hibernate. Several writes in SecureVault depend on exact database behavior:

- Records use client-generated IDs (ADR 0007). JPA's `save()` treats an entity with an existing ID as an update and merges it. A client sending another user's record ID could then overwrite that row.
- Record updates and master password changes must only apply when the stored version matches what the client read. Hibernate's `@Version` also starts at 0, while the API specifies version 1.
- Token consumption must check and mark the token in one step, so two requests with the same token cannot both succeed.

## Decision
Use Spring's `JdbcClient` with explicit SQL for vault records, vault key material, one-time tokens, and the activity log. Plain `INSERT` fails on any existing ID. Conditional `UPDATE ... WHERE version = ? RETURNING` statements make the check and the change atomic. Every statement includes `user_id`. JPA remains for the `users` table, where loading an entity and changing a field is enough.

## Consequences
The rules are visible in the SQL and covered by integration tests on PostgreSQL, including the IDOR suite. Two data-access styles coexist, so each repository says which one it uses and why. Mapping rows by hand adds some code that JPA would otherwise generate.
