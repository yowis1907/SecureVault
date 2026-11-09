# 0006. Same-origin hosting

**Status:** Accepted, 2026-11-08

## Context
A separate API domain would need CORS rules, and CORS misconfiguration is a common source of serious vulnerabilities. It would also prevent use of the strict `__Host-` cookie prefix across origins.

## Decision
nginx serves the frontend and proxies `/api/` from a single origin. In development, Vite's proxy provides the same arrangement.

## Consequences
No CORS policy is needed. The frontend and API must be deployed behind one host, which restricts some hosting setups, such as a separate static-site CDN domain.
