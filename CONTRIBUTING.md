# Contributing

Thanks for looking. This is a learning project with strict security rules, so changes are held to them.

## Before you start

Read the [security architecture](docs/SECURITY_ARCHITECTURE.md). For anything touching cryptography, sessions, or what the server can see, also read section 5 of the [specification](docs/ARCHITECTURE.md) and the [threat model](THREAT_MODEL.md).

To report a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Rules that do not bend

1. The master password, the keys, and decrypted entries never leave the browser. No endpoint may accept them.
2. No plaintext vault content in the database, logs, URLs, or browser storage.
3. No hand-written cryptographic primitives and no new algorithms. Compose Web Crypto, `hash-wasm`, and Bouncy Castle as the specification says.
4. A change to any encrypted format needs a new `cryptoVersion`. There are no fallbacks to older formats.
5. Every record query is scoped by the signed-in user. Someone else's record answers 404.
6. Tests use generated values only. Never real credentials.

## Workflow

1. If behavior changes, update the contract first: [API specification](docs/API_SPECIFICATION.md) or [database design](docs/DATABASE_DESIGN.md). Schema changes are new Flyway migrations; merged migrations are never edited.
2. Write the test before the fix, and watch it fail. Security changes need a negative test: the wrong key, tampered data, another user's ID.
3. A decision with security consequences gets a record in [`docs/adr`](docs/adr/README.md).
4. Run every check below. Do not skip or weaken a failing test.

## Checks

Backend, from `backend/` (needs Docker):

```bash
./mvnw verify
```

Frontend, from `frontend/`:

```bash
npm run lint && npm run typecheck && npm run format:check && npm test && npm run build
```

End-to-end, with the stack running, from `e2e/`:

```bash
npx playwright test
```

## Style

- Java is formatted by Spotless with google-java-format: `./mvnw spotless:apply`.
- TypeScript is formatted by Prettier: `npm run format`.
- Comments explain why, not what.
- New dependencies need a reason. Anything that injects styles or scripts at runtime will not pass the Content Security Policy (see [ADR 0014](docs/adr/0014-native-elements-instead-of-radix.md)).

## Commits

One logical change per commit, with a message that says what changed and why.
