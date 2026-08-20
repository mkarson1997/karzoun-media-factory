# Karzoun Media Factory

Private, mobile-first control plane for producing, reviewing, scheduling, publishing, and analyzing AI-generated short-form video for **Karzoun Media Lab** and future channels.

## Flow

`Prompt Library → Queue → Generation → Review → Approval → Schedule → Publish → Analytics`

Milestone 1 deliberately runs with **mock video and mock publishing providers**. It does not spend video-generation credits and it does not upload anything to YouTube.

## Stack

- Next.js 15 + React 19 + TypeScript
- PostgreSQL with Prisma
- Telegram Bot API via Telegraf
- Zod validation
- Vitest
- Docker Compose

## Quick start with Docker

1. Copy `.env.example` to `.env`.
2. At minimum, set `APP_BASE_URL=http://localhost:3000`.
3. Telegram values are optional until you want phone/bot control.
4. Run:

```bash
docker compose up -d --build
```

The app container pushes the Prisma schema and runs the idempotent seed. Open:

`http://localhost:3000/dashboard`

Health check:

`http://localhost:3000/api/health`

Stop:

```bash
docker compose down
```

Database data stays in the named `kmf-postgres` volume.

## Local development without Docker

Requirements: Node.js 24+ and PostgreSQL.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run seed
npm run dev
```

In a second terminal:

```bash
npm run worker
```

## Import the 1,000-prompt bank

Expected CSV columns:

`id, channel, category, duration_seconds, concept, prompt`

Run:

```bash
npm run import:prompts -- ./data/Karzoun_Media_Lab_1000_Shorts_Prompts.csv
```

The importer validates every row before writing anything, rejects duplicate IDs inside the file, and upserts by external prompt ID so reruns are safe.

Valid channel values:

- `GENERAL`
- `KIDS_CHANNEL_ONLY`

Kids-only prompts are never automatically routed to the general channel.

## Telegram setup

Create a Telegram bot with BotFather, then set only these server environment values:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
APP_BASE_URL=https://your-dashboard.example
```

The bot denies every other Telegram user. Commands:

- `/start`
- `/status`
- `/queue`
- `/review`
- `/help`

Review messages include **Approve** and **Reject** buttons. The Settings screen also contains a test-notification action. Tokens are never rendered in the browser.

## Mock mode

Keep:

```text
VIDEO_PROVIDER=mock
```

The worker progresses mock jobs through:

`QUEUED → GENERATING → READY_FOR_REVIEW`

After approval and scheduling it can progress:

`SCHEDULED → PUBLISHING → PUBLISHED`

The resulting publish record is marked `MOCK_PUBLISHED`. No real YouTube request occurs.

## Pages

- `/dashboard` factory counters, recent activity and connections
- `/prompts` searchable prompt library and queue action
- `/queue` production state machine controls
- `/review` mobile video review and approval
- `/schedule` private-default internal scheduling
- `/analytics` real-metrics-only placeholder
- `/settings` operational limits, channels and connection status

## Environment variables

See `.env.example`. Never commit real values.

Milestone 1 does **not** require Anthropic, OpenArt/video-provider, or YouTube credentials. Those keys remain empty until the corresponding integration milestone.

## Validation

Run before deployment:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
docker compose config
```

## Safe acceptance flow

1. Seed or import prompts.
2. Open `/prompts` and queue one GENERAL prompt.
3. Let the worker move it to `READY_FOR_REVIEW`.
4. Approve from the dashboard or Telegram.
5. Open `/schedule`, keep visibility `PRIVATE`, and choose a time.
6. Let the mock publisher complete the flow.
7. Confirm Activity Log / Dashboard counters changed.
8. Confirm no real video-provider or YouTube request occurred.

## Supabase

A hosted Supabase PostgreSQL database can replace the local Compose database by setting its Postgres connection string as `DATABASE_URL`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are reserved for later storage/auth integrations and are not required by the Milestone 1 control plane.

## Milestones

1. **Control plane foundation**
2. 1,000-prompt library import and production UX
3. Claude creative-director integration
4. Video provider / MCP integration
5. Multi-model routing
6. Mobile and Telegram review workflow hardening
7. YouTube OAuth + first PRIVATE upload
8. Scheduler + real publishing
9. Analytics + performance scoring
10. Security hardening + deployment

See `SECURITY.md` before connecting any paid or publishing credential.
