# Secrets checklist

Only these values need to be supplied by the operator. Never commit the real values.

## Required for the factory itself

```text
DATABASE_URL=
APP_BASE_URL=https://<factory-domain>
APP_SECRET=<random 32+ character secret>
```

`APP_SECRET` protects the operator session and encrypts stored integration credentials.

## Telegram phone control

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
```

Both values must be present together. Every other Telegram user is rejected.

## Claude creative director

```text
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
CREATIVE_DIRECTOR=anthropic
```

Keep real rendering locked while testing Claude planning.

## OpenArt MCP rendering

```text
VIDEO_PROVIDER=openart-mcp
OPENART_MCP_URL=https://mcp.openart.ai/mcp
OPENART_MCP_ACCESS_TOKEN=
VIDEO_MODEL_HINT=
```

`VIDEO_MODEL_HINT` may stay empty.

The spending switches are separate:

```text
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

For the first real video, enable only manual paid generation.

## YouTube

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
PUBLISHING_PROVIDER=youtube
```

Google OAuth redirect URI must be:

```text
https://<factory-domain>/api/youtube/callback
```

Do not paste a refresh token manually for normal operation. Use **Connect YouTube** from `/setup` or `/settings`; the factory receives the token through OAuth and stores it encrypted.

Keep these closed for initial connection:

```text
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

For the first upload enable only `ALLOW_YOUTUBE_UPLOAD=true`. PUBLIC remains locked, so the upload is forced PRIVATE.

## Kids channel

No extra shared secret is required. Create the KIDS channel record, then use **Connect YouTube** while signed into the kids YouTube channel/account.

The factory stores a separate OAuth credential for that channel. Kids jobs cannot reuse the GENERAL channel credential.

## Optional

```text
REMOTE_MEDIA_ALLOWED_HOSTS=
ANALYTICS_SYNC_MINUTES=30
SEED_DEMO_DATA=false
```

When the final OpenArt/CDN hostnames are known, `REMOTE_MEDIA_ALLOWED_HOSTS` can be set to a comma-separated allowlist.

## Activation order

1. Add database, base URL and APP secret.
2. Open `/setup` and tap **Prepare safe factory**.
3. Add Telegram values and tap **Test Telegram**.
4. Add Claude/OpenArt values with spending locks closed.
5. Render one manual real video.
6. Add Google OAuth values and connect YouTube from `/setup`.
7. Enable one PRIVATE YouTube upload.
8. Verify analytics.
9. Only then consider paid Autopilot or PUBLIC publishing.
