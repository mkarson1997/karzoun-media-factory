# Karzoun Media Factory: Secrets Setup

Never paste real secret values into GitHub issues, commits, screenshots, or chat. Put them only in the local `.env` file or a production secrets manager.

## 1. Local core secrets

On Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-windows.ps1
```

The script creates `.env` if missing and generates strong local values for:

```text
POSTGRES_PASSWORD=
APP_SECRET=
```

`APP_SECRET` is also the operator password used by the private dashboard login. The script keeps every paid/publishing safety lock closed.

The local host port defaults to 3100 so port 3000 can remain available to other projects:

```text
KMF_PORT=3100
APP_BASE_URL=http://localhost:3100
```

For the first local run keep:

```text
KMF_PORT=3100
APP_BASE_URL=http://localhost:3100
SEED_DEMO_DATA=false
CREATIVE_DIRECTOR=mock
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
PUBLISHING_PROVIDER=mock
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

If you intentionally choose another local port later, change both `KMF_PORT` and `APP_BASE_URL` to the same host port.

### Important: reloading `.env`

`docker compose restart` restarts the existing containers with their existing environment. It does **not** reliably reload newly edited values from `.env` into already-created containers.

After changing Telegram, Claude, OpenArt, YouTube, or any other `.env` value, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\reload-env.ps1
```

That recreates only `app` and `worker`, preserves the PostgreSQL volume, waits for health, and loads the new environment values.

## 2. Telegram

Official setup:

1. Open `@BotFather` in Telegram.
2. Send `/newbot`.
3. Choose the bot display name and username.
4. Copy the bot token into:

```text
TELEGRAM_BOT_TOKEN=
```

To obtain your numeric Telegram user ID without a third-party bot:

1. Send any message to the new bot.
2. In PowerShell, run locally, replacing only the temporary value below:

```powershell
$token = 'PASTE_YOUR_BOT_TOKEN_HERE'
(Invoke-RestMethod "https://api.telegram.org/bot$token/getUpdates").result | ConvertTo-Json -Depth 10
```

3. Find `message.from.id` for your message and place the number in:

```text
TELEGRAM_ALLOWED_USER_ID=
```

4. Save `.env`, then reload the environment into the containers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\reload-env.ps1
```

5. Open `/settings` and press `Send test notification`.

Treat the bot token as a password. If it is ever exposed, revoke/regenerate it in BotFather.

## 3. Claude / Anthropic API

Go to the Claude developer console at `https://platform.claude.com/`, then Settings -> API keys -> Create key.

Put the key only in `.env`:

```text
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
```

For real creative planning change:

```text
CREATIVE_DIRECTOR=anthropic
```

After editing `.env`, run `scripts/reload-env.ps1` so the app and worker receive the new values.

A Claude web/desktop subscription and Claude API billing are separate. Make sure the developer console has usable API credits/billing before testing the real creative director.

## 4. OpenArt MCP

OpenArt's remote MCP endpoint is:

```text
OPENART_MCP_URL=https://mcp.openart.ai/mcp
```

The normal Claude connector flow manages OpenArt sign-in for Claude itself, but Karzoun Media Factory calls OpenArt through Anthropic's server-side MCP connector. That server-side path needs an OAuth access token.

For the first test, use the official MCP Inspector OAuth flow:

```powershell
npx @modelcontextprotocol/inspector
```

Then in the Inspector:

1. Choose `Streamable HTTP`.
2. Enter `https://mcp.openart.ai/mcp`.
3. Open Auth Settings.
4. Start `Quick OAuth Flow`.
5. Sign in to OpenArt and approve access.
6. Continue until authentication completes.
7. Copy the returned `access_token` into:

```text
OPENART_MCP_ACCESS_TOKEN=
```

Keep these settings until the first paid test is intentional:

```text
VIDEO_PROVIDER=mock
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

When ready for exactly one manual real render:

```text
VIDEO_PROVIDER=openart-mcp
ALLOW_PAID_GENERATION=true
ALLOW_AUTOPILOT_PAID_GENERATION=false
```

After editing `.env`, run `scripts/reload-env.ps1`.

The current factory uses the access token you provide. OAuth access tokens can expire; if OpenArt authentication later fails, repeat the OAuth flow to obtain a fresh token before re-enabling production.

Optional:

```text
VIDEO_MODEL_HINT=
REMOTE_MEDIA_ALLOWED_HOSTS=
```

Leave `VIDEO_MODEL_HINT` blank initially so OpenArt/Claude can choose an available model. Leave the media hostname allowlist blank for the first controlled test, then restrict it after observing the actual OpenArt/CDN output hosts.

## 5. Google / YouTube OAuth

Create or select a project in Google Cloud Console.

Enable:

- YouTube Data API v3
- YouTube Analytics API

Configure the OAuth consent screen, then create an OAuth client of type `Web application`.

For local testing with the default Karzoun port add this exact authorized redirect URI:

```text
http://localhost:3100/api/youtube/callback
```

If you change `KMF_PORT`, use the matching `APP_BASE_URL` callback instead.

For a deployed HTTPS factory use:

```text
https://YOUR_FACTORY_DOMAIN/api/youtube/callback
```

Copy the values into `.env`:

```text
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
```

After editing `.env`, run `scripts/reload-env.ps1`.

Do not manually create or paste a YouTube refresh token. Start the factory, open `/setup` or `/settings`, and press `Connect YouTube` for each factory channel. The app performs OAuth and stores the refresh token encrypted with `APP_SECRET`.

If the authorized Google account exposes more than one owned YouTube channel, the factory shows an explicit channel picker instead of silently binding the first result. This is important when Karzoun Media Lab and the kids channel are under the same Google account.

First real upload settings:

```text
PUBLISHING_PROVIDER=youtube
ALLOW_YOUTUBE_UPLOAD=true
ALLOW_PUBLIC_PUBLISHING=false
```

This forces the first real upload to PRIVATE. Do not unlock public publishing until the PRIVATE test is confirmed on the correct channel.

## 6. Kids channel

Create the kids channel in YouTube first. Then inside Karzoun Media Factory:

1. Settings -> Add channel.
2. Choose `KIDS_CHANNEL_ONLY`.
3. Enter the channel name.
4. Press `Connect YouTube` for that factory channel.
5. Pick the exact kids YouTube channel if the Google account exposes multiple channels.

Keep Kids Autopilot disabled initially. Kids jobs are routed separately and automatically send YouTube's Made for Kids declaration.

## 7. Final activation order

Use `/setup` as the checklist. The safe order is:

1. Safe local mock factory.
2. Install/verify the 1,000-prompt bank.
3. Telegram test.
4. Claude credentials configured, paid rendering still locked.
5. OpenArt OAuth token configured, paid rendering still locked.
6. One manual paid render.
7. Review that render.
8. YouTube OAuth connection for the exact GENERAL channel.
9. One PRIVATE upload.
10. Create/connect the kids channel separately.
11. Verify analytics.
12. Only then consider paid Autopilot or PUBLIC publishing.

Emergency stop at any time:

```text
/pause
```

or Settings -> Pause everything.
