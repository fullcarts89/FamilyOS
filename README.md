# FamilyOS

A shared household operating system for our family: capture what needs handling, plan the week together, and delegate follow-through with explicit approval.

Proprietary and confidential. All rights reserved (see `LICENSE`).

**Status:** M0, repository foundation. Product, architecture and plan documents live on the Phase A branch (PR #1): `FAMILYOS_PRD.md`, `docs/product/product-contract.md`, `docs/architecture/architecture-decision-record.md` and `docs/plan/implementation-plan.md`.

## Layout

| Path | What it is |
|---|---|
| `apps/api` | HTTP API (Hono on Node). The only path from clients to the database |
| `apps/worker` | Background jobs (Graphile Worker): timers, reminders, recurrence |
| `apps/mobile` | Expo / React Native app for iOS and web |
| `packages/domain` | Shared types, state enums and transition tables |
| `packages/db` | Typed database access (Kysely) |
| `supabase/` | Local stack config and SQL migrations |

## Development

Requires Node 24+, Docker and the Supabase CLI. pnpm runs through Corepack.

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm stack:up
```

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`pnpm stack:up` starts the local Supabase stack and applies `supabase/migrations`. `pnpm stack:down` stops it. Tests may only reach the local machine; any other network call fails.

## Inputs

- `FAMILYOS_PRD.md`: product requirements
- `COMPETITOR_AUDIT.md`: initial competitor audit
- `CLAUDE_EXECUTION_BRIEF.md`: execution rules and phase gates
