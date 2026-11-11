# Security Policy

## Status

SecureVault is a security engineering project. It has not been independently audited, and it should not be used to store real credentials. The [self-review](docs/SECURITY_AUDIT.md) and the [threat model](THREAT_MODEL.md) describe what was tested and what is known to be out of reach.

## Reporting a vulnerability

Please report privately, not in a public issue.

Use GitHub's private reporting: on the repository page, open the **Security** tab and choose **Report a vulnerability**.

A useful report includes:

- what an attacker could do, and what they need to begin with
- steps to reproduce, or a proof of concept
- the commit you tested

Please use only your own test accounts and a local instance. Do not include real credentials in a report.

This is a personal project with no service-level commitment. I aim to reply within a week and to fix confirmed issues on `main`.

## What counts

In scope, for example:

- the server learning vault contents, the master password, or anything derived from it
- reading or changing another user's records
- bypassing authentication, session expiry, CSRF protection, or step-up confirmation
- a weakness in how the cryptographic building blocks are combined
- secrets appearing in logs, URLs, or browser storage

Already documented as limits, so not new findings:

- a compromised server delivering modified JavaScript
- malware or extensions on the user's device
- guessing a weak master password offline after a database theft
- rollback or deletion of records by the server
- the metadata listed in section 7 of the threat model

## Supported versions

Only the latest commit on `main`.
