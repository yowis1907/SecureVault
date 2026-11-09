---
name: code-review
description: Use when reviewing SecureVault code at the end of a phase, before a commit or merge, or when asked to check a change for bugs, security vulnerabilities, performance problems, maintainability, architecture consistency, or regression risk.
---

# Code Review for SecureVault

Review like a skeptical senior engineer. Read the real code and verify each finding by tracing the path. Do not report a guess as a fact.

## Process

1. Establish scope: which diff or files, and which phase or feature.
2. Read the contract the code implements (`docs/API_SPECIFICATION.md`, `docs/DATABASE_DESIGN.md`, `docs/ARCHITECTURE.md`).
3. If the change touches secrets, sessions, or crypto, also apply the checklist in the `security-engineering` skill.
4. For each candidate finding, describe the concrete input or state that triggers it. Drop it if you cannot.
5. Run the relevant tests and static checks if they have not been run on this exact code.

## What to check

**Correctness**
- [ ] Error paths, null and empty values, and boundaries
- [ ] Concurrent edits (version checks) and transaction scope
- [ ] Async races: lock during a pending decrypt, or a response arriving after logout
- [ ] Behavior matches the documented contract

**Security**
- [ ] Authorization on every owned resource
- [ ] Nothing sensitive in logs, URLs, storage, or error bodies
- [ ] Input is validated on the server, not just the client
- [ ] No new way for plaintext vault data to reach the server
- [ ] New dependencies are justified, pinned by lockfile, and recently maintained

**Performance**
- [ ] N+1 queries, missing indexes, and unbounded result sets
- [ ] Argon2 is not run on the main thread or without a concurrency bound
- [ ] No repeated decryption of the entire vault on each render

**Maintainability and architecture**
- [ ] Layer and feature boundaries are respected, with no circular dependencies
- [ ] No duplicated business logic, no unnecessary abstraction
- [ ] Oversized components and classes are split
- [ ] No security-critical TODO in place of an implementation
- [ ] Names match the domain language of the docs

**Regression risk**
- [ ] Existing tests still describe the intended behavior
- [ ] New behavior has tests, including the failure cases
- [ ] Migrations are forward compatible with stored data

## Severity

- **Critical:** breaks zero-knowledge, exposes another user's data, or bypasses authentication.
- **High:** exploitable security flaw, data loss, or a broken core journey.
- **Medium:** a bug with limited impact, or a missing control with other defenses in place.
- **Low:** maintainability or minor correctness.

Do not pad the review with style preferences that a formatter would handle.

## Expected output

Findings ordered by severity. Each has: file and line, what is wrong, a concrete failure scenario, and a suggested fix. End with what was reviewed, which checks were run with their results, and what was not covered. If nothing was found, say so plainly and do not invent issues.
