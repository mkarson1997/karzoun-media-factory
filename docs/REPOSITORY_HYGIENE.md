# Repository Hygiene

Keep the public repository limited to source, documentation, tests, and synthetic demo material.

Never commit:

- real `.env` files or deployment secrets
- OAuth access/refresh tokens or client-secret JSON
- Telegram bot credentials or allowlisted personal identifiers
- database dumps or local runtime databases
- generated private media or temporary renders
- logs containing credentials, private URLs, or account identifiers
- local editor, cache, build, and dependency output

If a credential is ever committed, remove it from use immediately and rotate/revoke it. Deleting only the latest file is not enough because Git history may retain the value.
