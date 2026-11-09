# 0012. Hand-written API contract first

**Status:** Accepted, 2026-11-08

## Context
Generating documentation from code means the code defines the contract. Here the contract defines exactly which data may cross the zero-knowledge boundary, so it should be designed deliberately.

## Decision
`docs/API_SPECIFICATION.md` is the source of truth and changes first. No OpenAPI generator is added for now.

## Consequences
The document can drift from the code, so integration tests assert the documented status codes and error codes. A generated OpenAPI description can be reconsidered once the API is stable.
