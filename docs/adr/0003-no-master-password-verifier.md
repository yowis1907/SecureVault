# 0003. No master password verifier on the server

**Status:** Accepted, 2026-11-08

## Context
Some password managers log in with a hash derived from the master password. That hands the server a value derived from the secret that protects the vault. SecureVault already has a separate account password for authentication.

## Decision
Nothing derived from the master password is ever sent. Unlocking succeeds when AES-GCM successfully unwraps the DEK. A wrong password fails the authentication tag check.

## Consequences
The server cannot rate limit unlock attempts, so Argon2id's cost is the only brake. A stolen database permits offline guessing against the wrapped DEK, which is why the KDF parameters are set above the account password's and why a strength check applies to the master password.
