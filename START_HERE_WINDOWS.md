# START HERE - Windows

This is the shortest safe path for the first local launch.

## 1. Requirements

- Git for Windows
- Docker Desktop with Docker Compose v2
- PowerShell

Node.js is not required on the Windows host for the Docker-first path. The project container uses Node 24.

## 2. Clone

```powershell
Set-Location "$HOME\Desktop"
git clone https://github.com/mkarson1997/karzoun-media-factory.git
Set-Location .\karzoun-media-factory
```

Because the repository is private, GitHub may ask you to authenticate.

## 3. One-command safe first boot

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-windows.ps1
```

This command:

- creates `.env` if it does not exist
- generates a strong PostgreSQL password
- generates a strong `APP_SECRET`
- uses host port `3100` by default so ordinary Next.js projects can keep port `3000`
- stores the configurable host port as `KMF_PORT=3100`
- migrates an older local `APP_BASE_URL=http://localhost:3000` to port 3100 without changing your secrets
- forces first boot into MOCK mode
- keeps every paid-generation and YouTube publishing lock closed
- validates Docker Compose
- builds the image
- runs lint, TypeScript checks, unit tests, and the production Next.js build inside the Docker build
- starts PostgreSQL, the web app, and the worker
- waits for the health endpoint
- opens `http://localhost:3100/setup`

If port 3100 is ever needed by another application, choose another unused host port in `.env` and keep `KMF_PORT` and `APP_BASE_URL` aligned.

If the Docker build fails, the factory does not start. Fix the reported validation error before adding any real credentials.

## 4. Login

Open `.env` locally and copy the value of:

```text
APP_SECRET=
```

Use that value as the dashboard operator password.

Never send this value in chat or commit `.env` to Git.

## 5. Prepare the safe factory

Open:

```text
http://localhost:3100/setup
```

Press:

```text
Prepare safe factory
```

That creates the GENERAL factory channel if missing and installs/refreshes the built-in 1,000-prompt bank. It does not call Claude, OpenArt, or YouTube.

## 6. Add real integrations one by one

Follow:

```text
docs/SECRETS_SETUP.md
```

Recommended order:

1. Telegram
2. Claude API
3. OpenArt MCP OAuth token
4. One manual real video
5. YouTube OAuth for Karzoun Media Lab
6. One PRIVATE YouTube upload
7. Kids factory channel + exact kids YouTube binding
8. Analytics verification
9. Paid Autopilot only after manual verification
10. PUBLIC publishing only after PRIVATE verification

## Useful commands

```powershell
docker compose ps
docker compose logs --tail=200 app worker db
docker compose restart app worker
docker compose down
docker compose up -d --build
```

Emergency stop from Telegram after it is configured:

```text
/pause
```

or use Settings -> Pause everything.
