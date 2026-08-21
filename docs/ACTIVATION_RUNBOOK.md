# Karzoun Media Factory Activation Runbook

This is the shortest safe path from a fresh checkout to the first real PRIVATE YouTube test.

The phone-first activation screen is:

`/setup`

It shows only readiness state and missing environment variable names. It never renders secret values.

## Phase A: prove the factory without spending anything

```bash
git pull --ff-only origin main
cp .env.example .env
```

Set only:

```text
APP_BASE_URL=http://localhost:3000
APP_SECRET=<at least 32 random characters>
```

Keep all safety locks closed:

```text
SEED_DEMO_DATA=false
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
PUBLISHING_PROVIDER=mock
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

Start:

```bash
docker compose up -d --build
```

Then run:

```bash
npm run prompts:bootstrap
npm run verify:mock
npm run doctor
```

`verify:mock` runs static validation plus a temporary end-to-end job. The smoke phase pauses background production/publishing, refuses every real provider/publishing lock, completes the mock workflow through smart scheduling, removes its temporary records, and restores the previous pause/limit settings.

Open `/setup` and confirm the safe mock phase is green.

## Phase B: phone + Telegram

Add:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
```

Restart the app/worker, then use the **Test Telegram** button on `/setup`.

Useful commands:

```text
/status
/autopilot
/review
/schedule
/analytics
/pause
/resume
```

Enable Autopilot only while `VIDEO_PROVIDER=mock` first. Confirm it selects distinct ideas and every generated item stops at Review.

A ready-for-review notification should expose one-tap actions for:

- Approve + smart schedule
- Approve only
- Regenerate
- Reject

## Phase C: first paid render, manual only

Add Claude/OpenArt credentials and select the real video provider:

```text
CREATIVE_DIRECTOR=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
```

Keep both paid locks false until `/setup` shows the renderer is configured.

Then unlock only:

```text
ALLOW_PAID_GENERATION=true
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

Generate exactly one MANUAL real video and review it from the phone.

## Phase D: optional paid Autopilot

Only after the manual render is verified:

```text
ALLOW_AUTOPILOT_PAID_GENERATION=true
```

Start with a low daily target. Autopilot still cannot approve or publish its own videos.

## Phase E: first YouTube upload

Configure:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

Open `/setup` or `/settings`, connect the correct factory channel through Google OAuth, and verify the channel binding shown in the UI.

GENERAL and KIDS channels must be connected independently.

Then unlock only:

```text
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

Upload exactly one approved video. The public lock forces the upload to PRIVATE.

Verify the correct YouTube channel, title, description, Made for Kids flag when relevant, stored publish record, and analytics ingestion.

## Phase F: smart scheduling learning

The first schedules use starter time slots. They are not claimed to be universal YouTube best times.

After enough factory publications have real performance scores, the scheduler learns stronger observed local publishing hours from this factory's own data and uses those instead.

It also enforces lead time and spacing so scheduled uploads do not bunch together.

## Phase G: public publishing

Only after PRIVATE verification:

```text
ALLOW_PUBLIC_PUBLISHING=true
```

Keep daily production/publishing limits low for the first week and raise them from Analytics evidence rather than volume alone.

## Demo data

Demo data is opt-in only:

```text
SEED_DEMO_DATA=true
```

Production should normally keep it false. If older demo records already exist, remove them with:

```bash
npm run demo:cleanup
```

## Emergency brake

From Telegram:

```text
/pause
```

Or Dashboard → Settings → **Pause everything**.

This stops new generation and publishing starts while keeping files, jobs, review decisions, schedules and analytics intact.
