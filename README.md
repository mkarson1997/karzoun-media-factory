# Karzoun Media Factory

Private, mobile-first control center for AI short-video production.

Primary channel: **Karzoun Media Lab**.

Flow:

`Prompt Bank → Autopilot/Manual Queue → Claude → Video Provider → Review → Smart Schedule → YouTube → Analytics → Better future choices`

The factory is single-operator by design. Paid generation, paid Autopilot, YouTube upload, and PUBLIC publishing use separate safety locks.

## Stack

- Next.js + React + TypeScript
- PostgreSQL + Prisma
- Telegram via Telegraf
- Claude/Anthropic creative director
- OpenArt remote MCP video provider
- Google OAuth + YouTube Data API + YouTube Analytics API
- Zod + Vitest + ESLint
- Docker Compose

## Fast start

```bash
cp .env.example .env
docker compose up -d --build
```

Open:

- `/dashboard` daily control room
- `/setup` phone-first activation wizard

The header safety badge links to `/setup` from every page.

## Activation wizard

`/setup` shows:

- database and operator-security readiness
- prompt-bank state
- Telegram state and test action
- Claude/OpenArt configuration state
- every YouTube channel binding
- paid-generation locks
- Autopilot spending lock
- YouTube upload lock
- PUBLIC publishing lock

It shows missing environment-variable **names only**. Secret values are never rendered.

See `docs/PHONE_LAUNCH.md` for the shortest phone-first operating flow.

## Validation

Static + build validation:

```bash
npm run validate
```

Configuration/readiness check:

```bash
npm run doctor
```

Safe mock end-to-end test:

```bash
npm run smoke:mock
```

Everything together:

```bash
npm run verify:mock
```

The smoke flow refuses paid/provider upload locks, pauses background lanes, creates temporary data, proves Queue → Generate → Review → Approve + Smart Schedule → Publish, cleans up, then restores the previous factory settings.

## 1,000-prompt bank

The built-in deterministic bank contains exactly:

- **650 GENERAL** briefs
- **350 KIDS_CHANNEL_ONLY** briefs
- 30–59 second targets
- vertical 9:16 direction
- hook, pacing, continuity, captions/sound direction, payoff, and loopable ending
- explicit original-content/copyright constraints
- additional kids safety constraints

Install with one tap from `/prompts`, or:

```bash
npm run prompts:bootstrap
```

GENERAL and KIDS prompts never auto-route into the wrong channel type.

## Autopilot

Autopilot is **off by default**.

When enabled it:

- chooses only unused prompts
- respects rolling 24-hour production limits
- keeps GENERAL and KIDS targets separate
- learns from category performance after real analytics exist
- still explores categories without enough data
- penalizes recently repeated categories
- uses database locks against duplicate workers
- stops every generated video at manual review

It never approves its own video.

Real paid Autopilot requires both:

```text
ALLOW_PAID_GENERATION=true
ALLOW_AUTOPILOT_PAID_GENERATION=true
```

Manual paid testing can unlock only the first value. A blocked paid Autopilot job cannot starve a later manual job in the worker queue.

## Smart scheduling

From Review or Telegram, one tap can **Approve + smart schedule**.

Before enough analytics exist, the scheduler uses clearly labeled starter slots. After enough scored factory publications exist, it learns stronger observed local publishing hours from the factory's own data.

It also enforces:

- minimum lead time
- minimum spacing between scheduled uploads
- IANA timezone conversion
- PRIVATE-first visibility safety

The scheduler does not claim to know a universal YouTube “best time.”

## Telegram control

Configure:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
APP_BASE_URL=https://factory.example.com
```

Only the allowlisted Telegram user is accepted.

Useful commands:

```text
/status
/autopilot
/queue
/review
/schedule
/analytics
/pause
/resume
```

Ready-for-review alerts include inline actions for:

- Approve + smart schedule
- Approve only
- Regenerate
- Reject

`/pause` is the emergency brake for generation and publishing.

## Claude creative director

Safe default:

```text
CREATIVE_DIRECTOR=mock
```

Real mode:

```text
CREATIVE_DIRECTOR=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

The creative plan is validated before rendering. The quality gate checks visual-beat count, repetition, hook/script quality, manipulation language, and kids-specific commercial/safety rules.

## OpenArt MCP video generation

Safe default:

```text
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

Real configuration:

```text
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
VIDEO_MODEL_HINT=
```

The OpenArt adapter remains unable to spend credits until `ALLOW_PAID_GENERATION=true`.

Remote generated-media ingestion is HTTPS-only and blocks credentials in URLs, custom ports, private/local networks, unsafe redirects, unsupported content types, and oversized streams. `REMOTE_MEDIA_ALLOWED_HOSTS` can further restrict provider CDN hosts.

## YouTube

Configure:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
APP_BASE_URL=https://factory.example.com
APP_SECRET=<at least 32 random characters>
```

Connect each factory channel separately from `/setup` or `/settings`.

Refresh tokens are stored encrypted with AES-GCM. A KIDS channel never falls back to the GENERAL channel credential.

Safe first upload:

```text
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

With the public lock closed, real YouTube uploads are forced to **PRIVATE**.

Kids jobs send the Made for Kids declaration automatically from `KIDS_CHANNEL_ONLY` routing.

## Analytics

The worker periodically stores real YouTube metrics and a transparent internal comparison score used by Analytics, Autopilot, and Smart Scheduling.

The system does not fabricate metrics that the targeted public YouTube Analytics API does not expose.

## Demo data

Demo data is opt-in:

```text
SEED_DEMO_DATA=true
```

Production should normally keep:

```text
SEED_DEMO_DATA=false
```

Remove old demo records with:

```bash
npm run demo:cleanup
```

## Production deployment

With a hosted PostgreSQL/Supabase `DATABASE_URL`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The production web container binds to `127.0.0.1:3000`. Put TLS/reverse-proxy or a secure tunnel in front of it.

The worker refuses to start when blocking runtime configuration is invalid.

## Safe first real run

1. Prove the full factory in mock mode.
2. Configure Telegram and test it from `/setup`.
3. Configure Claude + OpenArt while paid locks stay closed.
4. Unlock only manual paid generation and render one real video.
5. Review it manually.
6. Connect the intended YouTube channel.
7. Enable YouTube upload while PUBLIC stays locked.
8. Upload one PRIVATE video.
9. Verify the publish record and analytics.
10. Only then consider paid Autopilot or PUBLIC publishing.

## Pages

- `/dashboard` control room + Autopilot + next publishing
- `/setup` activation wizard
- `/prompts` prompt bank and import
- `/queue` production jobs
- `/review` mobile video quality gate
- `/schedule` smart/manual scheduling
- `/analytics` performance cockpit
- `/settings` limits, channels, providers and safety controls

## Project status

Implemented:

- control plane
- 1,000-prompt bank
- Claude creative director
- OpenArt MCP boundary
- mobile + Telegram review
- YouTube OAuth/private-first publishing
- scheduling
- analytics
- Autopilot
- smart scheduling
- activation wizard
- production safety hardening

The final external gate is running `npm run verify:mock` and the first real provider/PRIVATE YouTube tests in an environment with Node, Docker, database access, and the operator's secrets.

See `SECURITY.md`, `docs/ACTIVATION_RUNBOOK.md`, and `docs/PHONE_LAUNCH.md` before opening real-provider locks.
