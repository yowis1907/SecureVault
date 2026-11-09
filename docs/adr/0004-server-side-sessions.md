# 0004. Server-side sessions instead of JWT

**Status:** Accepted, 2026-11-08

## Context
SecureVault needs immediate logout, "end all sessions", and invalidation after a password reset. JWTs are valid until they expire unless a server-side denylist is added, which removes their main advantage.

## Decision
Use opaque session IDs in an `HttpOnly` cookie, with session state in PostgreSQL through Spring Session JDBC.

## Consequences
Every request reads the session from the database, which is acceptable at this scale and avoids adding Redis. Spring Session stores IDs unhashed, so a database read exposes live sessions. A session gives access only to ciphertext, and sensitive actions need step-up authentication.
