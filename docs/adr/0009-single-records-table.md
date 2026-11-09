# 0009. One table for all record types

**Status:** Accepted, 2026-11-08

## Context
Logins and categories are different concepts to the user, but the server sees both only as encrypted bytes with an owner and a version.

## Decision
Store both in `vault_records` with a `record_type` column, served by one set of endpoints.

## Consequences
No duplicated CRUD code, and adding a record type requires only a new enum value and client support. The server can see how many records of each type a user has.
