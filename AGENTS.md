# Instructions for coding agents

Read by Atomic Agent, Codex and other agents that load `AGENTS.md`. Execution rules and phase gates are in `CLAUDE_EXECUTION_BRIEF.md`, and they apply to every agent, including workers that a planner delegates to.

## Commands

Node 24+, pnpm through Corepack (`corepack enable`).

| What | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| All checks CI runs without a database | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm licenses:check` |
| Local Supabase stack (needs Docker) | `pnpm stack:up` / `pnpm stack:down` |
| Database and auth tests | `pnpm test` with `DATABASE_URL` set (see `.env.example`); without it those tests are skipped |

A change is not done until `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` passes. Never report a check you did not run as passing.

## Layout

- `packages/domain`: pure types, state machines and rules (no I/O). Most logic and its tests belong here.
- `packages/db`: Kysely access, row-level-security tests, test fixtures.
- `apps/api`: Hono HTTP API, the only path from clients to the database.
- `apps/worker`: Graphile Worker jobs.
- `apps/mobile`: Expo app (iOS and web).
- `supabase/migrations`: SQL migrations, append-only.

## Rules

- **Tests make no network calls** other than to the local machine; `test/setup/no-network.ts` enforces this. Do not loosen it.
- **Never skip, disable or weaken a test** to get a green run.
- **Migrations are append-only.** Add a new timestamped file; never edit one that is already in `supabase/migrations`.
- **Household isolation is security-critical.** Changes to migrations, grants, row-level-security policies, `apps/api/src/http/authorize.ts`, `apps/api/src/auth/`, or the service logins need a matching test in `packages/db/src/rls.test.ts`, `packages/db/src/logins.test.ts` or `apps/api/src/security.test.ts`. Planners: do not delegate these to worker models; do them yourself.
- **No household content in logs.** Use the explicit loggers; `console.log` fails lint.
- **No secrets in the repository**, in logs or in test fixtures. `.env` files are ignored; only `.env.example` is committed.
- **Dependencies must pass `pnpm licenses:check`.** Pin exact versions as the existing `package.json` files do.
- **No deploys, real accounts, emails, payments or paid services** without the founder's approval (brief rule 7).
- Follow the code style around the change: TypeScript strict, `import type` for types. Expo Router screens in `apps/mobile/app` use default exports; elsewhere follow the file's existing exports.
