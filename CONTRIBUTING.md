# Contributing

Thanks for contributing to Karzoun Media Factory.

## Local verification

Before opening a pull request, run the repository's lint, typecheck, test, and production build commands defined in `package.json`.

## Secrets and private data

Never commit real `.env` files, API keys, OAuth tokens, refresh tokens, client-secret JSON, Telegram credentials, database exports, logs containing credentials, generated private media, or operator/account identifiers.

Use `.env.example` only for variable names and safe placeholders.

## Safety defaults

Changes must preserve fail-safe defaults for paid generation, autopilot paid generation, YouTube upload, and public publishing unless a change explicitly and intentionally modifies those controls with corresponding tests and documentation.

## Pull requests

Keep changes focused, explain the user-visible or operational impact, and include tests when behavior changes.
