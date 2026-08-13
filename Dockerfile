FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile

COPY packages/schema packages/schema
COPY packages/db packages/db
COPY apps/server apps/server

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["pnpm", "--filter", "@foundation/server", "start"]
