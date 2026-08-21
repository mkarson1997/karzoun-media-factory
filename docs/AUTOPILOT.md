# Karzoun Media Factory Autopilot

Autopilot removes repetitive operator work without removing the human publishing gate.

## What it does

1. Reads rolling 24-hour production targets.
2. Chooses only active prompts that have never had a production job before.
3. Prefers categories with stronger real YouTube performance scores once analytics exist.
4. Adds an exploration bonus to categories without enough data.
5. Penalizes recently repeated categories so consecutive Shorts stay diverse.
6. Queues at most one new job per worker tick and uses a PostgreSQL advisory lock so duplicate workers cannot fill the same slot concurrently.
7. Lets the normal worker create the Claude plan and render the video.
8. Stops at `READY_FOR_REVIEW` and alerts Telegram.

Autopilot never approves a video and never bypasses the normal schedule/publishing state machine.

## Safe defaults

Database defaults:

- `autopilotEnabled=false`
- GENERAL target: `2` per rolling 24 hours
- kids autopilot: disabled
- kids target: `0`

Provider defaults:

```text
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

There are two separate spending locks for automatic paid generation:

1. `ALLOW_PAID_GENERATION=true` allows real provider generation in general.
2. `ALLOW_AUTOPILOT_PAID_GENERATION=true` separately allows Autopilot to create paid jobs.

Both must be true before Autopilot can queue work for a non-mock provider.

This allows one manual paid test video without accidentally turning the whole daily Autopilot target into paid generations.

## Mobile dashboard

Dashboard controls:

- Enable / disable Autopilot
- Queue next safe idea
- View GENERAL and KIDS rolling targets
- See unused prompt-bank counts
- See provider/spending safety blocks

Detailed targets are configured in Settings.

The total active Autopilot target cannot exceed the global daily production limit.

## Telegram

Use:

```text
/autopilot
```

The bot shows current targets, usage, remaining prompt-bank size and safety blocks.

Inline controls:

- Enable general Autopilot
- Disable Autopilot
- Queue next safe idea
- Open settings

All Telegram actions still require the configured `TELEGRAM_ALLOWED_USER_ID`.

## Kids isolation

Kids Autopilot is disabled by default.

When enabled, it can only select `KIDS_CHANNEL_ONLY` prompts and requires an enabled `KIDS_CHANNEL_ONLY` factory channel. YouTube credentials remain isolated per channel.

## Analytics learning

Autopilot uses the latest internal `performanceScore` snapshot per previously published job. It does not claim to reproduce YouTube's recommendation algorithm.

Before analytics exist, the selector deliberately explores categories instead of pretending to know a winner.

## Emergency stop

Use either:

- Dashboard → **Pause everything**
- Telegram → `/pause`

Production pause prevents Autopilot from adding new work and prevents the generation worker from starting new jobs. Existing records and analytics are preserved.
