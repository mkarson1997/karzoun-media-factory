# Karzoun Media Factory

Private control plane for producing, reviewing, scheduling, publishing, and analyzing AI-generated short-form video for **Karzoun Media Lab** and future channels.

## Product flow

Prompt Library → Production Queue → Video Generation → Review → Approval → Scheduling → Publishing → Analytics

## Milestone 1

This repository is being bootstrapped as a single-operator, mobile-first application with:

- Next.js + TypeScript
- PostgreSQL / Supabase-ready persistence
- Production job state machine
- Mock video and publishing providers
- Telegram control bot
- Mobile dashboard
- Prompt CSV import
- Docker support

Real paid video generation and real YouTube publishing are intentionally disabled until the control plane passes end-to-end tests in mock mode.

## Safety defaults

- Private repository
- Secrets are never committed
- Test publishing defaults to `PRIVATE`
- Kids-only content is isolated from general channel jobs
- External provider calls are adapter-based
- Real YouTube uploads and paid generation require explicit configuration

## Planned milestones

1. Control plane foundation
2. 1,000-prompt library import and production UX
3. Creative-director integration
4. Video provider / MCP integration
5. Multi-model routing
6. Mobile and Telegram review workflow
7. YouTube OAuth + private upload
8. Scheduling and publishing
9. Analytics and performance scoring
10. Security hardening and deployment
