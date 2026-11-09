# 0008. Combined registration wizard

**Status:** Accepted, 2026-11-08

## Context
If a user sets the account and master passwords to the same value, the server would receive the master password at login. The client can only compare them while both are in memory. Separate registration and setup steps could also leave accounts with no vault.

## Decision
One two-step wizard collects both passwords, rejects a match, and submits the account and wrapped key material in one request.

## Consequences
Refreshing mid-wizard restarts it, because the account password is deliberately held only in memory. Users whose email is already registered go through the same steps and receive an email instead, so the flow does not reveal which addresses exist.
