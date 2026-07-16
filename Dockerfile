FROM node:22-alpine AS build

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:22-alpine AS runtime

RUN corepack enable

ENV NODE_ENV=production
ENV RELENTLESS_WORKSPACE_ROOT=/app
ENV RELENTLESS_MCP_HOST=0.0.0.0

WORKDIR /app

COPY --from=build /app /app

EXPOSE 8787

CMD ["node", "packages/server/dist/server/src/cli.js", "serve"]
