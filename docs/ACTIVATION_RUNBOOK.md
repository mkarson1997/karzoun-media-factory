# Karzoun Media Factory Activation Runbook

This is the shortest safe path from a fresh checkout to the first real PRIVATE YouTube test.

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

`verify:mock` runs static validation plus a temporary end-to-end job. The smoke phase pauses background production/publishing, refuses every real provider/publishing lock, completes the mock workflow, removes its temporary records, and restores the previous pause/limit settings.

## Phase B: phone + Telegram

Add:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
```

Restart the app/worker and confirm:

```text
/status
/autopilot
/review
/pause
/resume
```

Enable Autopilot only while `VIDEO_PROVIDER=mock` first. Confirm it selects distinct ideas and every generated item stops at Review.

## Phase C: first paid render, manual only

Add Claude/OpenArt credentials and configure the real video provider.

Unlock only:

```text
ALLOW_PAID_GENERATION=true
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

Leave Autopilot automatic spending locked. Generate exactly one manual real video and review it from the phone.

## Phase D: optional paid Autopilot

Only after the manual render is verified:

```text
ALLOW_AUTOPILOT_PAID_GENERATION=true
```

Start with a low daily target. Autopilot still cannot approve or publish its own videos.

## Phase E: first YouTube upload

Configure the Google OAuth client, connect the correct factory channel from Settings, then use:

```text
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

Upload exactly one approved video. The public lock forces the upload to PRIVATE.

Verify the correct YouTube channel, title, description, Made for Kids flag when relevant, and analytics ingestion.

## Phase F: public publishing

Only after PRIVATE verification:

```text
ALLOW_PUBLIC_PUBLISHING=true
```

Keep daily production/publishing limits low for the first week and raise them from Analytics evidence rather than volume alone.

## Emergency brake

From Telegram:

```text
/pause
```

Or Dashboard → Settings → **Pause everything**.

This stops new generation and publishing starts while keeping files, jobs, review decisions, schedules and analytics intact.
