FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends acl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY apps/server/package.json apps/server/
COPY apps/viewer/package.json apps/viewer/

RUN pnpm install --frozen-lockfile

COPY packages/schema packages/schema
COPY packages/db packages/db
COPY apps/server apps/server
COPY apps/viewer apps/viewer
COPY scripts/vault-data-dir.sh /vault-data-dir.sh
RUN pnpm --filter @foundation/viewer build

ENV NODE_ENV=production
ENV PORT=8787
ENV VIEW_PORT=8788
EXPOSE 8787
EXPOSE 8788

CMD ["pnpm", "--filter", "@foundation/server", "start"]
