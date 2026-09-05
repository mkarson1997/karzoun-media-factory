# Public Release Notes

Karzoun Media Factory is published as a production-minded reference implementation for AI-assisted short-form media orchestration.

## Safe-by-default behavior

The repository keeps paid generation, paid autopilot, YouTube upload, and public publishing disabled by default. Real provider credentials belong only in a local `.env` file or a deployment secrets manager and must never be committed.

## Public repository hygiene

The public tree is intended to contain source code, documentation, safe examples, tests, and synthetic demo assets only. Runtime media, logs, local database state, OAuth token material, and operator/account data are excluded from version control.

## External services

The project can integrate with third-party AI, media-generation, messaging, database, and publishing providers. Their APIs, credentials, quotas, pricing, and terms are external to this repository.
