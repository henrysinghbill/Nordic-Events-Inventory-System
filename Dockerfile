# Nordic Events Inventory — production image.
# Build:  docker compose build      Run:  docker compose up -d

# ---- 1. Install dependencies -------------------------------------------------
FROM node:24-bookworm-slim AS base
# OpenSSL is needed by Prisma's database tools; ca-certificates for the step below.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Optional extra trusted certificates (*.crt), e.g. a company firewall or antivirus
# that inspects HTTPS. Without them, npm and the DHL check can't connect on such
# networks. See docker/certs/README.md. The folder is empty by default.
COPY docker/certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/copy-scanner-wasm.mjs ./scripts/
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
# Reports "unhealthy" in docker ps if the app or its database stops working.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
