# Karzoun Media Factory

Private, mobile-first control center for producing, reviewing, scheduling, publishing, and learning from AI-generated short-form video.

Primary channel: **Karzoun Media Lab**.

Core flow:

`Prompt Library → Queue → Claude Creative Plan → Video Provider → Review → Approval → Schedule → YouTube → Analytics`

The project is intentionally single-operator and keeps paid generation, real YouTube uploads, and public publishing behind separate safety locks.

## Stack

- Next.js + React + TypeScript
- PostgreSQL + Prisma
- Telegram Bot API via Telegraf
- Claude/Anthropic creative-director adapter
- OpenArt remote MCP video-provider adapter
- Google OAuth + YouTube Data API + YouTube Analytics API
- Zod + Vitest + ESLint
- Docker Compose

## Fast local start

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:3000/dashboard`.

The local Compose stack starts PostgreSQL, pushes the Prisma schema, seeds safe demo data, starts the web app, and starts the worker.

Stop it with:

```bash
docker compose down
```

## Validation

One command:

```bash
npm run validate
```

This runs lint, TypeScript checks, tests, and a production build.

Configuration/readiness check:

```bash
npm run doctor
```

The doctor checks database reachability, operator security, Telegram pairing, Claude/OpenArt configuration, YouTube connection state, and the publishing safety locks. It does not trigger a paid video generation or a YouTube upload.

## Prompt bank

CSV columns:

`id,channel,category,duration_seconds,concept,prompt`

Import from CLI:

```bash
npm run import:prompts -- ./data/Karzoun_Media_Lab_1000_Shorts_Prompts.csv
```

The `/prompts` page also supports CSV upload from a phone.

Allowed channel values:

- `GENERAL`
- `KIDS_CHANNEL_ONLY`

The control plane will not automatically route `KIDS_CHANNEL_ONLY` prompts to a GENERAL channel.

## Telegram control

Configure:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
APP_BASE_URL=https://factory.example.com
```

Only the allowlisted Telegram account is accepted.

Commands:

- `/start`
- `/status`
- `/queue`
- `/review`
- `/analytics`
- `/help`

Review controls include **Approve**, **Regenerate**, and **Reject**. Telegram also receives ready-for-review, failure, approval, schedule-reminder, and publishing notifications.

## Claude creative director

Safe default:

```text
CREATIVE_DIRECTOR=mock
```

Real Claude planning:

```text
CREATIVE_DIRECTOR=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

The creative director creates a structured production plan and stores it with the production job before rendering.

## OpenArt MCP video generation

Safe default:

```text
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
```

To configure the adapter:

```text
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
VIDEO_MODEL_HINT=
```

Real generation remains blocked until this is intentionally changed:

```text
ALLOW_PAID_GENERATION=true
```

`VIDEO_MODEL_HINT` is optional. Leave it empty to let the rendering operator choose a currently suitable model exposed by OpenArt.

`REMOTE_MEDIA_ALLOWED_HOSTS` can optionally contain a comma-separated host allowlist for generated media downloads. The downloader rejects HTTP, URL credentials, custom ports, local/private network addresses, unsafe redirects, unsupported content types, and streams larger than 1 GB.

## YouTube connection

Configure the Google OAuth client:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
APP_BASE_URL=https://factory.example.com
APP_SECRET=<strong random secret>
```

Then use the YouTube connect action in the dashboard/settings flow. The OAuth refresh token is encrypted with `APP_SECRET` before it is stored in PostgreSQL.

The requested scopes cover upload, read-only channel access, and YouTube Analytics.

## Publishing safety locks

Default:

```text
PUBLISHING_PROVIDER=mock
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

For the first real test, keep public publishing locked and enable only:

```text
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

That forces YouTube uploads to **PRIVATE** even if a schedule accidentally requests another visibility.

Only after private end-to-end verification should public publishing ever be considered:

```text
ALLOW_PUBLIC_PUBLISHING=true
```

Kids jobs pass the Made for Kids flag to YouTube automatically from their `KIDS_CHANNEL_ONLY` classification.

## Analytics learning loop

The worker periodically collects real metrics for videos uploaded by this factory.

Default cadence:

```text
ANALYTICS_SYNC_MINUTES=30
```

The `/analytics` page also has a manual sync action.

Stored metrics include:

- views
- engaged views
- likes
- comments
- shares
- subscribers gained/lost
- average view duration
- average percentage viewed
- engaged-view rate
- interaction rate
- subscriber conversion rate
- a transparent internal performance score

The score is only for comparing this factory's own Shorts. It is not presented as YouTube's ranking algorithm.

The public targeted YouTube Analytics API does not expose the YouTube Studio **viewed vs swiped away** card directly, so the factory deliberately leaves that field empty rather than fabricating a value.

## Pages

- `/dashboard` control-room counters, activity, connection state
- `/prompts` prompt library, filters, mobile CSV import, queue action
- `/queue` production state machine and retries
- `/review` mobile preview, creative plan, approve/regenerate/reject
- `/schedule` private-default publishing schedule
- `/analytics` performance cockpit and category winners
- `/settings` limits, channels, provider state, safety interlocks

## Local environment variables

See `.env.example`. Never commit `.env` or real credentials.

Use an `APP_SECRET` of at least 32 random characters. In production it protects the operator session and encrypts integration secrets.

## Production deployment

For a server using a hosted PostgreSQL/Supabase connection in `DATABASE_URL`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The production Compose file binds the web app to `127.0.0.1:3000`, so expose it through a TLS reverse proxy or secure tunnel rather than directly publishing the port.

Run before enabling real providers:

```bash
npm run doctor
```

## Safe first real run

1. Keep `VIDEO_PROVIDER=mock` and `PUBLISHING_PROVIDER=mock` until dashboard + Telegram are working.
2. Import the prompt bank.
3. Queue and complete a full mock job.
4. Configure Claude and OpenArt while `ALLOW_PAID_GENERATION=false`.
5. Run `npm run doctor`.
6. Unlock paid generation and create **one** real video.
7. Review it manually from phone/Telegram.
8. Connect YouTube OAuth.
9. Set `PUBLISHING_PROVIDER=youtube`, `ALLOW_YOUTUBE_UPLOAD=true`, and keep `ALLOW_PUBLIC_PUBLISHING=false`.
10. Upload **one PRIVATE test video**.
11. Verify analytics ingestion.
12. Only then increase production volume.

## Milestones

1. ✅ Control plane foundation
2. ✅ Prompt-bank import and production UX
3. ✅ Claude creative director
4. ✅ OpenArt MCP provider boundary
5. ✅ Provider routing and safety locks
6. ✅ Mobile + Telegram review workflow
7. ✅ YouTube OAuth + private-first uploader
8. ✅ Scheduler + publishing provider routing
9. ✅ YouTube analytics + internal performance scoring
10. 🚧 Final runtime validation and deployment activation

See `SECURITY.md` before connecting paid or publishing credentials.
