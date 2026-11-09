# The background worker (plan M4), a second Railway service with no public port. Build from the
# repository root: docker build -f deploy/worker.Dockerfile .
FROM node:24.16.0-bookworm-slim

WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
# The worker and its workspace packages only, plus the root's tsx; no Expo toolchain.
RUN pnpm install --frozen-lockfile --filter "@familyos/worker..." --filter familyos

COPY apps/worker apps/worker
COPY packages packages
COPY tsconfig.base.json ./

ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/tsx", "apps/worker/src/index.ts"]
