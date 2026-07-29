# syntax=docker/dockerfile:1.7

# ---------- Base ----------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

# ---------- Dependencies ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY . .
RUN pnpm --filter @freemodelfinder/ui build \
    && pnpm --filter @freemodelfinder/core build \
    && pnpm --filter @freemodelfinder/server build \
    && pnpm --filter freemodelfinder build

# Install production runtime dependencies for the bundled CLI package.
RUN cd packages/cli/dist \
    && npm install --omit=dev --no-audit --no-fund --ignore-scripts

# ---------- Runner ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV FREEMODELFINDER_HOME=/data
WORKDIR /app

RUN addgroup -S fmf && adduser -S fmf -G fmf \
    && mkdir -p /data \
    && chown -R fmf:fmf /data

COPY --from=build --chown=fmf:fmf /app/packages/cli/dist ./

USER fmf
VOLUME ["/data"]
EXPOSE 11435

ENTRYPOINT ["node", "/app/index.js"]
CMD ["serve", "--port", "11435"]
