# Karzoun Media Factory

Private, mobile-first control center for producing, reviewing, scheduling, publishing, and learning from AI-generated short-form video.

Primary channel: **Karzoun Media Lab**.

Core flow:

`Prompt Library → Autopilot/Manual Queue → Claude Creative Plan → Video Provider → Review → Approval → Schedule → YouTube → Analytics → Better Autopilot choices`

The project is intentionally single-operator and keeps paid generation, automatic paid generation, real YouTube uploads, and public publishing behind separate safety locks.

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

The doctor checks database reachability, operator security, Telegram pairing, Claude/OpenArt configuration, Autopilot readiness, every enabled YouTube channel binding, and publishing safety locks. It does not trigger paid video generation or a YouTube upload.

## 1,000-prompt bank

The repository contains a deterministic generator for exactly **1,000 original Shorts briefs**:

- **650 GENERAL** prompts across 13 entertainment categories
- **350 KIDS_CHANNEL_ONLY** prompts across 7 child-safe categories
- every requested duration is between **30 and 59 seconds**
- every brief requests vertical 9:16 output, a fast hook, continuity, captions/sound design, and a loopable ending
- every brief explicitly rejects copied creator footage, copyrighted characters, logos and watermarks
- kids prompts additionally prohibit frightening injuries, dangerous imitation and realistic peril

Install from the mobile Prompt Library with **Install 1,000 prompts**, or generate/import from CLI:

```bash
npm run prompts:bootstrap
```

CSV columns:

`id,channel,category,duration_seconds,concept,prompt`

The control plane never automatically routes `KIDS_CHANNEL_ONLY` prompts into a GENERAL channel.

## Autopilot

Autopilot is **off by default**. When enabled it:

- selects only unused prompts
- respects the global rolling 24-hour production limit
- keeps GENERAL and KIDS targets separate
- learns from real category performance scores after analytics exist
- keeps exploration alive for categories without enough data
- penalizes recently repeated categories to keep the feed diverse
- uses a PostgreSQL advisory lock so duplicate workers cannot fill the same target slot twice
- stops every generated video at `READY_FOR_REVIEW`

It never auto-approves a video.

Default database targets:

- GENERAL: 2 per rolling 24 hours
- KIDS: disabled / 0

For a real paid provider there are **two automatic-spending locks**:

```text
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

A manual paid generation can be tested by unlocking only the first value. Autopilot cannot spend provider credits until **both** are intentionally enabled.

The worker re-checks the Autopilot paid lock immediately before executing an already-queued automatic job, so closing the lock still prevents a queued automatic job from spending credits.

See `docs/AUTOPILOT.md` for the full operating model.

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
- `/autopilot`
- `/queue`
- `/review`
- `/analytics`
- `/pause`
- `/resume`
- `/help`

`/autopilot` shows daily targets, usage, remaining prompt-bank size and provider safety blocks. Inline controls can enable/disable Autopilot or fill the next safe target slot.

Review controls include **Approve**, **Regenerate**, and **Reject**. Telegram also receives Autopilot queue, ready-for-review, failure, approval, schedule-reminder, and publishing notifications. `/pause` is the emergency brake for both production and publishing; `/resume` re-enables them.

## Channel isolation

GENERAL and KIDS_CHANNEL_ONLY are separate factory channel records. Each channel can have its own encrypted YouTube OAuth refresh token and external YouTube channel binding.

A kids job cannot fall back to the general channel's OAuth credential. The worker passes the factory channel ID into the YouTube provider and verifies the connected YouTube channel before upload.

Kids Autopilot is independently disabled by default and requires an enabled KIDS channel before it can queue work.

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

The creative director creates a structured production plan and stores it with the production job before rendering. A creative-quality gate checks visual-beat count, repetition, hooks and child-safety/commercial language before real rendering.

## OpenArt MCP video generation

Safe default:

```text
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

To configure the adapter:

```text
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
VIDEO_MODEL_HINT=
```

`VIDEO_MODEL_HINT` is optional. Leave it empty to let the rendering operator choose a suitable model exposed by OpenArt.

`REMOTE_MEDIA_ALLOWED_HOSTS` can optionally contain a comma-separated host allowlist for generated media downloads. The downloader rejects HTTP, URL credentials, custom ports, local/private network addresses, unsafe redirects, unsupported content types, and streams larger than 1 GB.

## YouTube connection

Configure the Google OAuth client:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
APP_BASE_URL=https://factory.example.com
APP_SECRET=<strong random secret>
```

Then open Settings and connect YouTube separately for each enabled factory channel. Refresh tokens are encrypted with `APP_SECRET` before storage in PostgreSQL.

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

Stored metrics include views, engaged views, likes, comments, shares, subscribers gained/lost, average view duration, average percentage viewed, engaged-view rate, interaction rate, subscriber conversion rate and a transparent internal performance score.

The score is only for comparing this factory's own Shorts. It is not presented as YouTube's ranking algorithm. Autopilot uses these internal category scores as one signal for future selection.

The public targeted YouTube Analytics API does not expose the YouTube Studio **viewed vs swiped away** card directly, so the factory deliberately leaves that field empty rather than fabricating a value.

## Pages

- `/dashboard` control room, Autopilot, counters, pause state, activity and connections
- `/prompts` built-in prompt bank, filters, mobile CSV import, manual queue action
- `/queue` production state machine, origin labels and retries
- `/review` mobile preview, Auto/Manual label, creative plan, approve/regenerate/reject
- `/schedule` private-default publishing schedule
- `/analytics` performance cockpit and category winners
- `/settings` limits, Autopilot targets, channel creation/connection, provider state and safety interlocks

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

1. Keep video and publishing providers in mock mode.
2. Install the 1,000-prompt bank.
3. Enable Autopilot in mock mode and verify it selects distinct prompts and stops at review.
4. Verify Telegram Approve/Regenerate/Reject and `/pause`.
5. Configure Claude + OpenArt while both paid locks remain false.
6. Run `npm run doctor` and `npm run validate`.
7. Unlock only `ALLOW_PAID_GENERATION=true` and create **one manual real video**.
8. Review it from phone/Telegram.
9. Only after that test, optionally unlock `ALLOW_AUTOPILOT_PAID_GENERATION=true`.
10. Connect the correct YouTube channel from Settings.
11. Enable YouTube upload while keeping public publishing locked.
12. Upload **one PRIVATE test video**.
13. Verify analytics ingestion.
14. Only then increase daily targets or enable public publishing.

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
10. 🚧 Runtime validation and deployment activation
11. ✅ Analytics-aware Autopilot with independent paid-spend lock

See `SECURITY.md` before connecting paid or publishing credentials.
