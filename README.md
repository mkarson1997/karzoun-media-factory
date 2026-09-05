# Karzoun Media Factory

[![CI](https://github.com/mkarson1997/karzoun-media-factory/actions/workflows/ci.yml/badge.svg)](https://github.com/mkarson1997/karzoun-media-factory/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-24-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-96%25-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Open-source, mobile-first control center for AI-assisted short-video production, review, scheduling, publishing, and analytics.

Karzoun Media Factory is built as a **single-operator, safety-first automation system**. Paid generation, paid Autopilot, YouTube upload, and public publishing are independent runtime locks and remain disabled by default.

## Pipeline

```text
Prompt Bank
   ↓
Autopilot / Manual Queue
   ↓
Creative Director
   ↓
Video Provider
   ↓
Human Review Gate
   ↓
Smart Schedule
   ↓
YouTube
   ↓
Analytics → future scheduling / category decisions
```

## Highlights

- **1,000-prompt deterministic bank** with 650 GENERAL and 350 KIDS_CHANNEL_ONLY briefs.
- **Human-in-the-loop review** before generated media can move toward publishing.
- **Provider abstraction** for local/mock and remote AI/video providers.
- **Zero-cost/local verification path** that does not require production credentials.
- **Telegram control plane** for status, queue, review, scheduling, pause/resume, and alerts.
- **YouTube OAuth integration** with explicit channel selection and PRIVATE-first publishing.
- **Smart scheduling** using timezone-aware constraints and observed factory analytics.
- **Autopilot safety controls** with rolling limits, database locks, and separate paid-generation authorization.
- **Remote-media hardening** for HTTPS, host restrictions, local/private-network blocking, redirects, content types, and stream limits.
- **Encrypted integration credential storage** using AES-256-GCM.
- **Synthetic demo workflow** for reproducible development and CI.

## Stack

- Next.js 15 + React 19 + TypeScript
- Node.js 24
- PostgreSQL + Prisma
- Telegraf / Telegram Bot API
- Anthropic, OpenAI/Groq-compatible creative-provider paths, local Ollama path
- OpenArt MCP integration boundary
- Google OAuth + YouTube Data API + YouTube Analytics API
- Zod + Vitest + ESLint
- Docker Compose

## Safe quick start

Requirements: Node.js 24 and Docker.

```bash
cp .env.example .env
docker compose up -d --build
```

Then open `/setup` for the activation/readiness flow or `/dashboard` for the control room.

The checked-in `.env.example` contains variable names and safe defaults only. Real `.env` files are ignored and must never be committed.

## Verification

```bash
npm ci
npm run validate
npm run smoke:mock
```

Or run the complete safe verification path:

```bash
npm run verify:mock
```

`verify:mock` is designed to validate the factory without real provider credentials or public publishing. The smoke flow pauses unsafe lanes, creates temporary synthetic data, exercises Queue → Generate → Review → Approve/Schedule → Publish through safe providers, cleans up, and restores the previous settings.

GitHub Actions also runs install, lint, typecheck, tests, and a production build on `main` and pull requests.

## Safety model

The following controls are independent and default to `false`:

```text
ALLOW_PAID_GENERATION=false
ALLOW_AUTOPILOT_PAID_GENERATION=false
ALLOW_YOUTUBE_UPLOAD=false
ALLOW_PUBLIC_PUBLISHING=false
```

This separation is intentional. For example, a controlled manual generation test does not automatically authorize paid Autopilot, and enabling YouTube upload does not automatically authorize PUBLIC visibility.

Other boundaries include:

- operator authentication before dashboard/API control paths
- allowlisted Telegram operator
- OAuth state verification
- encrypted refresh-token/integration-secret storage
- channel-type separation between GENERAL and KIDS workflows
- PRIVATE-first YouTube behavior
- generated-media URL validation before ingestion
- redaction of credential-like provider errors
- no real secrets required by CI

See [SECURITY.md](SECURITY.md) before enabling real providers.

## Main surfaces

| Surface | Purpose |
| --- | --- |
| `/dashboard` | Control room, Autopilot state, next publishing actions |
| `/setup` | Activation and safety-readiness wizard |
| `/prompts` | Prompt bank and import |
| `/queue` | Production job queue |
| `/review` | Mobile human review gate |
| `/schedule` | Smart/manual scheduling |
| `/analytics` | Performance cockpit |
| `/settings` | Limits, channels, providers, and safety controls |

## Autopilot

Autopilot is **off by default**. When intentionally enabled it selects unused prompts, respects rolling production limits, keeps GENERAL and KIDS targets separate, uses database locking against duplicate workers, and stops generated videos at manual review.

It never approves its own video.

## Publishing posture

The recommended real-provider activation sequence is deliberately gradual:

1. Prove the full workflow in mock/local mode.
2. Configure and test Telegram.
3. Configure creative/video providers while paid locks remain closed.
4. Unlock one intentional manual generation test.
5. Review the result manually.
6. Connect the exact YouTube channel.
7. Enable upload while PUBLIC publishing remains locked.
8. Verify one PRIVATE upload and analytics.
9. Only then consider paid Autopilot or PUBLIC publishing.

## Documentation

- [Security policy](SECURITY.md)
- [Windows first run](START_HERE_WINDOWS.md)
- [Activation runbook](docs/ACTIVATION_RUNBOOK.md)
- [Phone launch flow](docs/PHONE_LAUNCH.md)
- [Autopilot](docs/AUTOPILOT.md)
- [Secrets setup](docs/SECRETS_SETUP.md)
- [Secrets checklist](docs/SECRETS_CHECKLIST.md)
- [Portfolio engineering showcase](PORTFOLIO_SHOWCASE.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Repository hygiene

Runtime media, logs, local databases, OAuth material, generated private artifacts, and real environment files are excluded from version control. Public examples and seed data are synthetic.

If a credential is ever committed, deleting the current file is not sufficient. Revoke/rotate it and treat Git history as exposed.

## Project status

Implemented areas include the control plane, prompt bank, creative-provider layer, video-provider layer, mobile/Telegram review, YouTube OAuth and private-first publishing, scheduling, analytics, Autopilot, activation/readiness tooling, and production safety controls.

Real external-provider behavior still depends on each operator's credentials, provider availability, quotas, billing, and account configuration. Those external conditions are not represented as guaranteed by this repository.

## License

Released under the [MIT License](LICENSE). Third-party dependencies and external services remain subject to their own licenses and terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
