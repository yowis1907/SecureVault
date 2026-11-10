# End-to-end tests

Playwright tests that run against the full Docker Compose stack: nginx with the production CSP, the API, PostgreSQL, and Mailpit.

## What they prove

- **The core journey works:** register, confirm the email through the link Mailpit received, sign in, unlock, add a login, refresh (which locks), unlock again, edit, delete, and sign out.
- **The server never sees vault secrets.** Each run uses unique canary values for the master password and every entry field. The test fails if any canary appears in a request URL, request body, or response body, in any database row (as text or as PostgreSQL's hex form of `bytea`), or in the API and nginx logs.
- **The scans can find things.** Positive controls check that the account password does appear in the sign-in request and that the email address does appear in the database, as designed.
- **Locking reaches every tab,** and a wrong master password is refused.

All accounts and passwords are generated per run. No real credentials are used.

## Running locally

From the repository root, start the stack:

```bash
docker compose --env-file .env.example up -d --build --wait
```

Then, in this folder:

```bash
npm ci
```

```bash
PW_CHANNEL=msedge npx playwright test
```

`PW_CHANNEL=msedge` uses the Edge browser that comes with Windows. On other systems, run `npx playwright install chromium` once and leave `PW_CHANNEL` unset.

Registration is limited to 5 per hour per IP, and each run registers 3 accounts. To run again within the hour, restart the API, which resets its in-memory limits:

```bash
docker compose --env-file .env.example restart api
```
