# FamilyOS

A shared household operating system for our family: capture what needs handling, plan the week together, and delegate follow-through with explicit approval.

Proprietary and confidential. All rights reserved (see `LICENSE`).

**Status:** M1, household foundation: invite-only sign-in, household isolation, audit and export. Product, architecture and plan documents live on the Phase A branch (PR #1): `FAMILYOS_PRD.md`, `docs/product/product-contract.md`, `docs/architecture/architecture-decision-record.md` and `docs/plan/implementation-plan.md`.

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

The local stack uses ports 553xx so it can run beside other local Supabase projects. After the first `pnpm stack:up`, copy `.env.example` to `.env` and fill the two empty values from `supabase status`. Run `pnpm test` with `DATABASE_URL` set (and the `SUPABASE_*` values for the Auth tests) to include the database and security tests.

### Creating the household

There is no public sign-up. An operator creates the household and its owner once:

```bash
pnpm --filter @familyos/api household:bootstrap --name "Our Home" --timezone America/Los_Angeles --owner-email you@example.com --owner-name Sam
```

The owner then signs in with an emailed 6-digit code and invites the other adult from the app. Locally, sign-in emails land in Mailpit at http://127.0.0.1:55324.

## Inputs

- `FAMILYOS_PRD.md`: product requirements
- `COMPETITOR_AUDIT.md`: initial competitor audit
- `CLAUDE_EXECUTION_BRIEF.md`: execution rules and phase gates
