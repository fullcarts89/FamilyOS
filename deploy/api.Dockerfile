# The API plus the web app (plan M4), one Railway service, which also runs the background worker
# when WORKER_DATABASE_URL is set (deploy/start.mjs, decision 6). Build from the repository root:
#   docker build -f deploy/api.Dockerfile \
#     --build-arg EXPO_PUBLIC_SUPABASE_URL=... --build-arg EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... .
# Railway passes service variables of the same names as build arguments.
FROM node:24.16.0-bookworm-slim

WORKDIR /app
RUN corepack enable pnpm

# Dependencies first, so source edits don't reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY apps/mobile apps/mobile
COPY apps/worker apps/worker
COPY packages packages
COPY tsconfig.base.json ./

# Publishable values only: they are compiled into the web bundle. The API is same-origin.
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" && test -n "$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  && cd apps/mobile \
  && EXPO_PUBLIC_API_URL=/api CI=1 npx expo export --platform web --output-dir /app/web-dist

# The page's content security policy allows exactly the Supabase origin compiled into the bundle.
ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/web-dist \
    WEB_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
COPY deploy/start.mjs deploy/start.mjs
USER node
EXPOSE 8787
CMD ["node", "deploy/start.mjs"]
