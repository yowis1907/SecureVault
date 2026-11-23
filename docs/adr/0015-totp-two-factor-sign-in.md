# 0015. TOTP two-factor sign-in, with the secret encrypted under a server key

**Status:** Accepted, 2026-11-23. Adds to the authentication design in ARCHITECTURE section 6.

## Context

The account password is the only thing between an attacker and a signed-in session. A signed-in session cannot open the vault without the master password, but it can delete records, reset the vault, and read the list of sessions and activity, and a phished or reused account password is a common way in. Two-factor sign-in limits what a stolen account password alone can do.

The options were TOTP (RFC 6238, the codes authenticator apps show), WebAuthn passkeys or security keys, and codes by email or SMS. Email codes add little when the same mailbox can reset the account password. SMS is weak against SIM swapping. WebAuthn resists phishing best, but needs a credential per device, browser support work, and a recovery story per authenticator. TOTP works with any authenticator app and is the expected baseline for this kind of product.

## Decision

- **TOTP:** HMAC-SHA1, 6 digits, 30-second steps, one step of drift allowed either side. SHA-1 appears only inside HMAC, where it is still sound, and it is the only algorithm every authenticator app supports. Codes come from the `java-otp` library (JCA HMAC), checked against the RFC 6238 test vector, and compared in constant time.
- **No replay:** the step of the last accepted code is stored, and a code for that step or an earlier one is refused. A conditional `UPDATE` makes two racing requests with one code unable to both pass.
- **Secret at rest:** 20 random bytes per user, encrypted with AES-256-GCM under `SECUREVAULT_MFA_KEY`, a key from the environment, with the user ID as associated data. A copy of the database alone cannot produce codes, and a ciphertext moved to another account fails to decrypt. The `prod` profile refuses to start without the key or with the example key from `.env.example`.
- **Sign-in in two steps:** a correct password for an account with 2FA returns `{"mfaRequired": true}` and stores only the pending user ID and time in the not-yet-authenticated session, under a new session ID. No authenticated session exists until `POST /auth/login/mfa` accepts a code. The pending state lasts 5 minutes and is dropped after 5 wrong codes. Code attempts are limited per IP (10 a minute) and per account (10 per 15 minutes).
- **Recovery codes:** 10 one-time codes of 12 characters from an unambiguous 30-character alphabet (about 59 bits each), shown once and stored only as SHA-256 hashes. A fast hash is right because the codes are random, as for email tokens.
- **Changes need step-up:** turning 2FA on needs the account password and a first valid code; turning it off needs the password and a code; new recovery codes need the password.

## Consequences

A stolen account password alone no longer signs in. The master password and the zero-knowledge design are unchanged: 2FA protects the account session, not the vault key. The server now holds one more secret, the MFA key, which must be generated, stored, and backed up with the deployment; losing it makes every enrolled user's secret undecryptable, and they would need an operator to clear their 2FA. A user who loses both the phone and the recovery codes cannot sign in, and there is no self-service reset by email, since that would let the mailbox bypass the second factor. Passkeys remain a possible later step.
