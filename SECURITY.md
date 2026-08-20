# Security

Karzoun Media Factory is a single-operator automation system with access to publishing and paid-generation services. Treat its credentials as production secrets.

## Rules

- Never commit `.env`, OAuth refresh tokens, Telegram tokens, provider keys, database passwords, or service-role keys.
- Keep `VIDEO_PROVIDER=mock` until a real provider is intentionally enabled and tested.
- Keep initial YouTube publishing `PRIVATE`.
- Configure `TELEGRAM_ALLOWED_USER_ID`; the bot rejects every other Telegram user server-side.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, or any provider key to browser code or `NEXT_PUBLIC_*` variables.
- Rotate a credential immediately if it appears in Git history, logs, screenshots, chat exports, or client bundles.
- Run the dashboard behind HTTPS and an authenticated/private access layer before exposing it to the public internet.
- Back up PostgreSQL before schema or destructive maintenance work.

## Application protections

- Mutation endpoints enforce same-origin requests.
- Runtime inputs are validated with Zod.
- Production-job transitions use a centralized allowlist state machine.
- Kids-only prompts cannot automatically target the general channel.
- Real provider calls are isolated behind adapters.
- Errors returned to clients are intentionally generic unless an error is safe to expose.

## Reporting

This is a private repository. Report a discovered vulnerability to the repository owner privately rather than opening a public disclosure.
