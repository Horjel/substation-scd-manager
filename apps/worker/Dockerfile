# syntax=docker/dockerfile:1
FROM node:24-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/scd/package.json packages/scd/package.json
COPY packages/storage/package.json packages/storage/package.json

FROM manifests AS dependencies
RUN npm ci

FROM manifests AS production-dependencies
RUN npm ci --omit=dev --legacy-peer-deps --workspace @substation/worker --include-workspace-root=false \
    && test ! -d node_modules/prisma \
    && test ! -d node_modules/typescript \
    && test ! -d node_modules/vitest \
    && test ! -d node_modules/eslint \
    && test ! -d node_modules/@playwright/test

FROM dependencies AS builder
COPY . .
RUN npm run db:generate

FROM builder AS migrate
CMD ["npm", "run", "db:migrate"]

FROM node:24-alpine AS worker
ENV NODE_ENV=production \
    WORKER_HEALTH_FILE=/tmp/substation-worker-ready
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/db/src ./packages/db/src
COPY --from=builder /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=builder /app/packages/domain/src ./packages/domain/src
COPY --from=builder /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=builder /app/packages/queue/src ./packages/queue/src
COPY --from=builder /app/packages/scd/package.json ./packages/scd/package.json
COPY --from=builder /app/packages/scd/src ./packages/scd/src
COPY --from=builder /app/packages/storage/package.json ./packages/storage/package.json
COPY --from=builder /app/packages/storage/src ./packages/storage/src
USER node
CMD ["node", "--import", "tsx", "apps/worker/src/main.ts"]
