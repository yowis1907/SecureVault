# 0001. Encrypt whole records as one blob

**Status:** Accepted, 2026-11-08

## Context
Encrypting only the password would leave titles and URLs readable, telling the server which services each user has accounts with. Encrypting each field separately hides content, but research on commercial password managers shows that it lets a malicious server swap fields between entries.

## Decision
Each record is one AES-256-GCM blob containing all of its fields. AAD binds it to its vault ID, record ID, and type.

## Consequences
The server cannot search, sort, or filter, so the client downloads and decrypts the full vault and searches in memory. Editing one field re-encrypts the whole record. This is why the vault size is capped at 5,000 records.
