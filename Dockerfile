# Nordic Events Inventory — production image.
# Build:  docker compose build      Run:  docker compose up -d

# ---- 1. Install dependencies -------------------------------------------------
FROM node:24-bookworm-slim AS base
# OpenSSL is needed by Prisma's database tools.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
# Also runs `prisma generate` and copies the scanner engine (postinstall).
RUN npm ci

# ---- 2. Build the app --------------------------------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 3. Tools to run database migrations at start-up --------------------------
FROM base AS migrate-tools
WORKDIR /migrate
COPY docker/migrate/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- 4. Final, small runtime image -------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app

# Photo folder (mount a persistent volume here).
RUN mkdir -p /data/uploads && chown node:node /data/uploads

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=migrate-tools /migrate/node_modules /migrate/node_modules
COPY prisma.config.ts /migrate/
COPY prisma /migrate/prisma
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
