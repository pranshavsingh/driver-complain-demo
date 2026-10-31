# ==============================================================================
# Multi-Stage Dockerfile for SSE Connect+ API (@driver-complaint/api)
# Build optimized with Turborepo pruning, pnpm, and Alpine Linux non-root runner.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Pruner
# ------------------------------------------------------------------------------
FROM node:24-alpine AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install global turbo for monorepo workspace slicing
RUN npm install -g turbo@^2

# Copy monorepo sources and isolate @driver-complaint/api and its workspace dependencies
COPY . .
RUN turbo prune @driver-complaint/api --docker

# ------------------------------------------------------------------------------
# Stage 2: Builder & Installer
# ------------------------------------------------------------------------------
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install explicit pnpm version matching repository packageManager
RUN npm install -g pnpm@10.15.0

# 1. Copy pruned lockfile and package.json files for maximum Docker layer caching
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# 2. Install dependencies based on frozen lockfile
RUN pnpm install --frozen-lockfile

# 3. Copy pruned source trees and root TypeScript configs
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/tsconfig.json ./tsconfig.json

# 4. Build workspace shared libraries (@driver-complaint/shared-types)
RUN pnpm --filter @driver-complaint/shared-types build

# 5. Generate Prisma Client for Alpine Linux musl environment
RUN pnpm --filter @driver-complaint/api prisma:generate

# ------------------------------------------------------------------------------
# Stage 3: Production Runner
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

# Production environment configurations
ENV NODE_ENV=production
ENV PORT=4000

# Copy node_modules and built packages from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/apps/api ./apps/api

# Security: Ensure non-root node user (UID 1000) owns application files
RUN chown -R node:node /app

# Switch to non-root execution
USER node

EXPOSE 4000

# Container liveness health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/health/liveness || exit 1

WORKDIR /app/apps/api

# Execute Express API using Node.js TypeScript loader
CMD ["node", "--import", "tsx", "--import", "./src/instrument.ts", "src/index.ts"]

