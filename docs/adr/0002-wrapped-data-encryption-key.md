# 0002. Wrap a random data encryption key

**Status:** Accepted, 2026-11-08

## Context
If records were encrypted directly with a key derived from the master password, changing that password would mean re-encrypting every record, and a failure midway could leave the vault partly converted.

## Decision
A random 256-bit DEK encrypts records. A KEK derived from the master password wraps the DEK, and only the wrapped form is stored.

## Consequences
A master password change is one small atomic update. However, the DEK itself does not change. Anyone who already holds an old wrapped DEK and the old master password can still decrypt the vault. Full DEK rotation is future work and is recorded as a residual risk in the threat model.
