# SecureVault

A zero-knowledge password manager built with Spring Boot, React, and PostgreSQL.

**Status: early development.** Only the project foundation exists so far. SecureVault has not had an independent security assessment and must not be used for real credentials.

## Documentation

- [Project plan](docs/PROJECT_PLAN.md)
- [Architecture and cryptographic specification](docs/ARCHITECTURE.md)
- [Threat model](THREAT_MODEL.md)
- [API specification](docs/API_SPECIFICATION.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [Architecture decision records](docs/adr/README.md)

## Requirements

JDK 25, Node.js 26 (or 24.15+), and Docker Desktop. Maven is downloaded automatically by the wrapper.

## Run with Docker

Copy `.env.example` to `.env` and set a password. Then run the following command and open <http://localhost:3000>:

```bash
docker compose up --build
```

## Run the checks

Backend, from `backend/`. `verify` includes integration tests, which need Docker running. On Windows, use `mvnw.cmd`:

```bash
./mvnw verify
```

Frontend, from `frontend/`:

```bash
npm ci
```
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
