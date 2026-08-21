# Security

Karzoun Media Factory is a single-operator automation system with access to publishing and paid-generation services. Treat every connected credential as a production secret.

## Non-negotiable rules

- Never commit `.env`, OAuth tokens, Telegram tokens, provider credentials, database passwords, or service-role keys.
- Use a unique `APP_SECRET` with at least 32 random characters.
- Keep `ALLOW_PAID_GENERATION=false` until one intentional manual paid-generation test.
- Keep `ALLOW_AUTOPILOT_PAID_GENERATION=false` until manual real generation has been verified.
- Keep `ALLOW_YOUTUBE_UPLOAD=false` until one intentional PRIVATE upload test.
- Keep `ALLOW_PUBLIC_PUBLISHING=false` until the PRIVATE workflow has been verified end to end.
- Keep `SEED_DEMO_DATA=false` in normal production.
- Configure `TELEGRAM_ALLOWED_USER_ID`; every other Telegram account is denied server-side.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, OAuth tokens, or provider credentials through `NEXT_PUBLIC_*` variables.
- Rotate a credential immediately if it appears in Git history, logs, screenshots, chat exports, or browser bundles.
- Put the production dashboard behind HTTPS. The production Compose file binds the app to loopback so a TLS reverse proxy or secure tunnel can own public exposure.
- Back up PostgreSQL before destructive schema or maintenance operations.

## Application protections

- Dashboard access requires the operator secret in production.
- Login comparison is timing-safe and login attempts are rate-limited in the single-node deployment.
- Login return paths reject protocol-relative/open-redirect forms.
- Mutation endpoints enforce same-origin requests.
- Runtime inputs are validated with Zod where external/operator input enters the system.
- Production-job transitions use a centralized allowlist state machine.
- Daily production and publishing limits prevent accidental content floods.
- Kids-only prompts cannot automatically target a GENERAL channel.
- GENERAL and KIDS YouTube OAuth credentials are isolated.
- Paid manual generation, paid Autopilot, YouTube upload, and public publishing have separate environment interlocks.
- The worker re-checks the paid Autopilot lock immediately before execution and skips blocked automatic jobs without starving manual work.
- YouTube refresh tokens obtained by OAuth are encrypted with authenticated AES-GCM storage before persistence.
- Provider secrets and integration tokens remain server-side.
- The activation wizard reports readiness and missing variable names without rendering secret values.
- Browser hardening includes CSP, framing denial, MIME-sniff prevention, restrictive referrer/device policies, and cross-origin opener isolation.
- Remote media ingestion requires HTTPS, blocks URL credentials/custom ports/private networks, validates redirects/content type, can enforce a hostname allowlist, and stops streams larger than 1 GB.
- Errors returned to clients are generic unless a specific message is explicitly safe for the operator.

## Provider activation sequence

Use `/setup` from the phone and run `npm run doctor` before enabling real providers.

Safe activation order:

1. Configure credentials while all spending/publishing locks remain false.
2. Verify Telegram and dashboard access.
3. Verify a complete mock workflow with `npm run verify:mock`.
4. Unlock manual paid generation for exactly one video.
5. Review the video manually.
6. Connect the intended YouTube channel through OAuth.
7. Unlock YouTube upload while keeping public publishing locked.
8. Upload exactly one PRIVATE video.
9. Verify the stored publish record and analytics ingestion.
10. Only then consider paid Autopilot or public publishing.

## Operational notes

- `REMOTE_MEDIA_ALLOWED_HOSTS` is optional. When actual provider/CDN hostnames are known, set a comma-separated allowlist to reduce remote-media attack surface further.
- The in-memory login rate limiter is appropriate for the intended single-node deployment. If the web app is horizontally scaled later, move rate limiting to a shared trusted store or edge layer.
- Do not use mock analytics as production data. The application deliberately displays empty states until real YouTube metrics exist.
- Demo records are opt-in. If legacy demo records exist, remove them with `npm run demo:cleanup`.
- The CSP intentionally permits inline styles/scripts required by the current Next.js runtime, but denies objects, framing, foreign forms, and non-HTTPS production connections.

## Reporting

This is a private repository. Report a discovered vulnerability privately to the repository owner rather than opening a public disclosure.
