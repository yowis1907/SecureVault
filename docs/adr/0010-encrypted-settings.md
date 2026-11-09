# 0010. Store vault settings encrypted

**Status:** Accepted, 2026-11-08

## Context
A plaintext auto-lock setting could be silently changed by a compromised server to keep vaults unlocked for longer.

## Decision
Vault settings are encrypted under the DEK. Non-sensitive display preferences such as theme remain in `localStorage`.

## Consequences
Settings can only be read after unlocking, which is fine as they apply only to an unlocked vault. A malicious server could replay an older valid value, and the client's fixed 1 to 60 minute range limits the effect.
