# 0007. Client-generated record IDs

**Status:** Accepted, 2026-11-08

## Context
Each record's AAD includes its ID, so the ID must exist before encryption.

## Decision
The browser generates a random UUID for each record and vault. The server enforces uniqueness.

## Consequences
The server must never overwrite on collision. A duplicate ID returns `409`. That response technically confirms a UUID exists, but random UUIDs cannot be guessed, so this reveals nothing useful.
