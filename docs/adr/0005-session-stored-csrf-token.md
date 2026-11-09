# 0005. Session-stored CSRF token

**Status:** Accepted, 2026-11-08

## Context
Cookie-authenticated APIs need CSRF protection. Spring's `csrf.spa()` setup is described in terms of cookie-stored tokens. OWASP now marks unsigned double-submit cookies as discouraged and recommends the synchronizer token pattern for stateful applications.

## Decision
Use Spring's session-backed repository with XOR masking. The client fetches the token from `GET /api/v1/auth/csrf` and keeps it in memory. `SameSite=Strict` and an Origin and Fetch Metadata filter add defense in depth.

## Consequences
Pre-login requests need an anonymous session to hold the token, so those sessions need a short lifetime and rate limiting on the token endpoint. The client must fetch a new token after login and logout.
