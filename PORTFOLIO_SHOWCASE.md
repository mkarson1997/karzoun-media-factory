# Karzoun Media Factory - Engineering Showcase

## Overview

Karzoun Media Factory is a mobile-first control plane for AI-assisted short-video production and publishing.

The system is deliberately designed around operational safety: expensive generation, automated generation, YouTube upload and public publishing are separate capabilities with separate locks. The default workflow can be proven end to end in mock mode before any paid provider or public channel is enabled.

## Stack

- Next.js
- React
- TypeScript
- PostgreSQL
- Prisma
- Telegram / Telegraf
- Anthropic / Claude integration boundary
- Remote MCP video-provider boundary
- Google OAuth
- YouTube Data API
- YouTube Analytics API
- Zod
- Vitest
- ESLint
- Docker Compose

## System flow

```text
Prompt Bank
    ↓
Manual / Autopilot Queue
    ↓
Creative Director
    ↓
Video Provider
    ↓
Manual Review
    ↓
Smart Schedule
    ↓
YouTube Publishing
    ↓
Analytics
    ↓
Future scheduling/category decisions
```

## Engineering highlights

### Explicit safety locks

The system treats expensive or externally visible actions as separate capabilities:

- paid generation
- paid Autopilot generation
- YouTube upload
- public publishing

Safe defaults keep those capabilities closed until intentionally enabled.

### Mock-first verification

The repository includes a mock end-to-end validation flow that exercises Queue → Generate → Review → Approve/Schedule → Publish without spending provider credits or publishing a real video.

That makes the production boundary testable before external credentials are introduced.

### Human review boundary

Autopilot can choose and generate work but it does not approve its own output. Generated videos stop at a review gate before publishing decisions continue.

### Credential handling

- provider configuration is environment-based,
- missing-variable diagnostics expose names rather than secret values,
- YouTube refresh tokens are stored encrypted,
- channel credentials are kept separate by channel type,
- generated-media ingestion is restricted to HTTPS and includes network/content-size safety checks.

### Scheduling and analytics

The scheduler starts with labeled starter slots and can later use observed publishing data. It enforces lead time, upload spacing, timezone handling and private-first visibility behavior.

### Mobile/Telegram operations

The operator can review system state and take bounded actions through the dashboard and Telegram, including pause/resume and review actions.

## Main product surfaces

```text
/dashboard   control room
/setup       activation/readiness wizard
/prompts     prompt bank
/queue       production queue
/review      quality gate
/schedule    publishing schedule
/analytics   performance cockpit
/settings    providers, limits and safety locks
```

## Validation workflow

The repository exposes dedicated commands for static/build validation, readiness checks and safe mock smoke testing. The full verification command combines those checks before real-provider activation.

## What this demonstrates

- Full-stack TypeScript product engineering
- External API and OAuth integration
- Secret-aware system design
- Paid-operation safeguards
- Background/queue-oriented workflows
- Human-in-the-loop automation
- Scheduling and analytics feedback loops
- Dockerized reproducible environments
- Operational readiness UX
- Failure-mode design instead of silent fallback

## Public-release note

The operational repository should remain private while it contains real provider/channel integration configuration and publishing infrastructure. A public portfolio edition should expose architecture, mocks and synthetic examples only, with no production credentials, channel identifiers or operator data.
