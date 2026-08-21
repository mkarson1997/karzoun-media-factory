# Phone-first launch

Use this after the server is deployed. The operator should not need a laptop for daily control.

## 1. Open the factory

Open:

`https://<your-factory-domain>/setup`

The header badge links to the same activation wizard from every page.

## 2. Safe mock phase

Keep these values locked:

```text
CREATIVE_DIRECTOR=mock
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
PUBLISHING_PROVIDER=mock
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

From `/setup`:

1. Confirm Database, APP_SECRET and APP_BASE_URL are green.
2. Install the built-in 1,000-prompt bank if needed.
3. Test Telegram.
4. Run one mock job from Prompt Library or Autopilot.
5. Approve + smart schedule from Telegram.

No provider credits or YouTube uploads are possible in this phase.

## 3. Connect real creative services

Set server-side values:

```text
CREATIVE_DIRECTOR=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
```

Keep both paid-generation locks false while checking `/setup`.

For the first paid render, unlock only:

```text
ALLOW_PAID_GENERATION=true
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

Queue exactly one MANUAL video and review the result.

## 4. Connect YouTube

Set:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

Open `/setup` or `/settings`, then tap **Connect** beside the intended channel and finish Google OAuth.

GENERAL and KIDS channels must be connected separately.

For the first upload set only:

```text
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

The YouTube provider forces the first real workflow to PRIVATE while public publishing stays locked.

## 5. Daily phone operation

Telegram is the fastest control surface:

- `/status`
- `/autopilot`
- `/review`
- `/schedule`
- `/analytics`
- `/pause`
- `/resume`

A ready video notification includes one-tap actions for approve + smart schedule, approve only, regenerate, and reject.

## 6. Optional automatic paid generation

Only after several manual real renders are verified:

```text
ALLOW_AUTOPILOT_PAID_GENERATION=true
```

Autopilot still cannot approve its own videos. Every render continues to stop at manual review.

## 7. Public publishing

Leave this false until a PRIVATE upload and analytics round trip have been verified:

```text
ALLOW_PUBLIC_PUBLISHING=false
```

Public publishing is the final lock, not part of initial activation.

## Emergency stop

From Telegram:

`/pause`

or from Settings tap **Pause everything**.

This stops new generation and publishing while preserving existing jobs, media, schedules, and analytics.
