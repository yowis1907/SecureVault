# 0011. Require email verification

**Status:** Accepted, 2026-11-08

## Context
If registration reports that an email is already taken, it reveals who has an account. Account password reset also relies on the email address actually belonging to the user.

## Decision
Registration always returns the same `202` response, and accounts must be verified by email before login. Unverified accounts are purged after 24 hours.

## Consequences
Development and CI need an email catcher, which Mailpit provides. Users must complete an extra step before first login.
