# syntax=docker/dockerfile:1
#
# Build context is the repo root (see docker-compose.yml: context: ..),
# since this stage needs both frontend/ and backend/ — they're sibling
# top-level directories, not nested under each other.

# Builds the console SPA (frontend/) — its dist/ output gets embedded into
# the Go binary in the next stage (internal/webui), keeping the deployed
# image a single process on a single port serving UI + REST + MCP together.
FROM node:22-alpine AS web-build
WORKDIR /web
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
# Overwrite the placeholder dist/ with the real build before compiling —
# go:embed reads this directory at `go build` time.
COPY --from=web-build /web/dist/ internal/webui/dist/
RUN CGO_ENABLED=0 go build -trimpath -o /out/rig ./cmd/rig

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=build /out/rig /usr/local/bin/rig
EXPOSE 8789
ENTRYPOINT ["/usr/local/bin/rig"]
