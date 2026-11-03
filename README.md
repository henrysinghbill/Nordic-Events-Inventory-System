# Nordic Events Inventory

Web app for tracking Nordic Group's event equipment and materials: what we have, where it is, and what is in which box. Mobile-first, self-contained (Next.js + PostgreSQL, packaged with Docker).

## Run it (Docker, one command)

Requires Docker.

```bash
cp .env.example .env        # then edit: SESSION_SECRET, POSTGRES_PASSWORD, INITIAL_ADMIN_*
docker compose up -d --build
```

Open http://localhost:3000 and sign in with `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`.
Database migrations run automatically on start. Data is kept in the Docker volumes `pgdata` (database) and `photos` (uploaded photos).

Stop with `docker compose down` (data is kept). `docker compose down -v` **deletes all data**.

## Development

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL only, on localhost:5432
cp .env.example .env                             # the defaults work for development
npx prisma migrate deploy                        # create the tables
npm run dev                                      # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm test` | Automated tests (needs the dev database running; uses a separate `inventory_test` database) |
| `npm run typecheck` / `npm run lint` | Type and code checks |
| `npm run db:migrate` | After changing `prisma/schema.prisma`: create and apply a new migration |

## Testing on your phone

Phone cameras only work over HTTPS, so open the app through a temporary Cloudflare tunnel (no account needed):

1. Start the app, either `npm run dev` or `docker compose up -d --build` (the Docker version is faster on a phone).
2. In a second terminal:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. It prints an address like `https://random-words.trycloudflare.com`. Open it on your phone.
4. Press Ctrl+C to close the tunnel when done. The address stops working, and you get a new one next time.

While the tunnel is open, anyone with the address can reach the sign-in page, so use a proper admin password and close the tunnel when you're done.

## Project layout

```
prisma/schema.prisma        Database schema (+ migrations/, including hand-written safety constraints)
src/proxy.ts                Sends signed-out visitors to the login page
src/server/
  auth/                     Sign-in. provider.ts is the swappable login interface;
                            providers/local.ts (built-in) and providers/vms.ts (stub for Nordic VMS)
  stock/                    ALL quantity changes: index.ts (add/remove stock),
                            boxes.ts (create, pack, unpack, ship, arrive, discard, link barcodes, scan lookup)
  items.ts, admin.ts        Item / company / location / user changes (each writes history)
  history.ts                Append-only history log
  idempotency.ts            Stops a retried request (weak signal) from being applied twice
  photos.ts                 Photo processing (resize, strip EXIF/GPS) and disk storage
  queries.ts                Read-only data for pages
src/app/                    Pages and Server Actions (login, (app)/… for signed-in pages, api/)
src/lib/barcodes.ts         What a scanned value means (box QR, DHL piece ID / waybill / routing)
src/components/scanner.tsx  Camera scanner (QR + Code 128) with a type-it-in fallback
src/app/print/labels/       Printable QR labels (A6 sticker or 8 per A4 sheet)
src/components/             Shared UI (forms that never fail silently, nav, photo grid, …)
tests/                      Automated tests (run against a real PostgreSQL)
docker/                     Container entrypoint (migrations on start) and helpers
scripts/                    copy-scanner-wasm.mjs: puts the scanner engine in public/vendor on install
                            (served by the app itself; no CDN)
```

See `.env.example` for every setting.
