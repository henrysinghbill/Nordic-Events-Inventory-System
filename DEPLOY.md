# Deploying the Nordic Events Inventory

For whoever runs the app on a server (written for Oliver, for the move to Nordic VMS).
It covers setting it up, HTTPS, updates, backups, monitoring, and connecting VMS logins.

**In short:** one Docker Compose file runs two containers: the app and PostgreSQL. All
data lives in two Docker volumes. The app needs HTTPS on a public address. Outbound
internet is only needed to build the image and, optionally, for DHL tracking.

```
 phones / laptops ──HTTPS──▶ reverse proxy (Caddy, nginx, …) ──HTTP──▶ app container :3000
                                                                          │
                                       volume "photos" (/data/uploads) ◀──┤
                                                                          ▼
                                                        db container (PostgreSQL 17)
                                                        volume "pgdata"
```

---

## 1. Server requirements

| | |
|---|---|
| OS | Any Linux that runs Docker (Windows Server / macOS work too for testing) |
| Software | Docker Engine 24+ with the Compose plugin (`docker compose version`) and `git` |
| CPU / RAM | 1–2 vCPU, **2 GB RAM** (building the image needs ~1.5 GB; running it ~300 MB) |
| Disk | ~5 GB for images and database, plus photos: about 0.3 MB per photo |
| Network in | HTTPS (443) reachable from the internet, see section 3 |
| Network out | Only for building and the optional DHL check, see below |

**Outbound internet access** is needed only for:

- **building the image**: Docker Hub (`node`, `postgres` images), the npm registry
  (`registry.npmjs.org`) and Debian package mirrors (`deb.debian.org`);
- **the optional DHL tracking check** (`api-eu.dhl.com`), only if `DHL_API_KEY` is set.

The running app needs nothing else from the internet. No CDNs, no external services.
If the server has no outbound access at all, build the image on another machine and
copy it over:

```bash
# on a machine with internet, in the project folder:
docker compose build && docker save nordic-events-inventory:latest postgres:17-alpine | gzip > inventory-images.tar.gz
# on the server:
gunzip -c inventory-images.tar.gz | docker load
docker compose up -d          # without --build
```

**Company firewall or antivirus that inspects HTTPS?** If the build fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `unable to verify the first certificate`, put the
inspecting proxy's root certificate in `docker/certs/` (see `docker/certs/README.md`) and build again.

---

## 2. First-time setup

```bash
git clone https://github.com/henrysinghbill/Nordic-Events-Inventory-System.git /srv/nordic-inventory
cd /srv/nordic-inventory
cp .env.example .env
```

Edit `.env`. At least:

| Setting | Value |
|---|---|
| `APP_BASE_URL` | The public HTTPS address, e.g. `https://inventory.nordicgroup.dk` (no trailing slash). Printed QR labels contain this address, so choose it before printing labels. |
| `SESSION_SECRET` | A long random string: `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | A long random string (only used between the two containers) |
| `AUTH_PROVIDER` | `local` until VMS logins are connected (section 8), then `vms` |
| `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` | The first administrator. With `vms`, use your VMS username; no password needed. |
| `APP_PORT` | Where the app listens on the host. Behind a proxy on the same machine use `127.0.0.1:3000`, so it isn't reachable without HTTPS. |

`DATABASE_URL` and `UPLOAD_DIR` in `.env` are ignored by `docker-compose.yml`, which sets them
to the database container and the photos volume. Every setting is explained in `.env.example`.

Start it:

```bash
docker compose up -d --build
docker compose ps                     # wait until app shows "healthy" (about a minute)
curl -s http://127.0.0.1:3000/api/health
# {"status":"ok","database":"ok","photos":"ok",...}
```

On start, the app applies database migrations (safe to run repeatedly), then creates
the five companies and "Copenhagen storeroom" the very first time. If no user called
`INITIAL_ADMIN_USERNAME` exists, it creates that user as an administrator.

Then put HTTPS in front (section 3), sign in, and with the local provider change the
admin password straight away (More → Users).

---

## 3. HTTPS and a public address (required)

The app must be served over **HTTPS on an address reachable from the internet**:

- **Phone cameras only work on HTTPS pages.** Browsers block the camera on plain
  `http://` (except `localhost`), so scanning box labels and taking photos would not work.
- **Staff use it from other countries**, at event venues and storage locations, over
  mobile data. It can't be limited to the office network or a VPN.
- **Login cookies are marked "secure"** when `APP_BASE_URL` starts with `https://`, and are
  only sent over HTTPS.
- Every page and API requires a login. Login attempts are rate-limited. Security headers
  (CSP, HSTS, no framing) are set by the app.

Terminate HTTPS in a reverse proxy and forward to the app on port 3000.

**Caddy** (automatic Let's Encrypt certificates), `/etc/caddy/Caddyfile`:

```
inventory.nordicgroup.dk {
    reverse_proxy 127.0.0.1:3000
    request_body {
        max_size 20MB
    }
}
```

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name inventory.nordicgroup.dk;
    # ssl_certificate / ssl_certificate_key …

    client_max_body_size 20m;              # photo uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;       # required: the app checks it against the browser's Origin
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;   # one value, set by nginx (used for login rate limits)
    }
}
```

Requirements for any proxy:
- Pass the original `Host` header. If it doesn't, every save fails with an "invalid Server Actions request" error.
- Allow request bodies of at least 16 MB, for photos.
- `APP_BASE_URL` must be exactly the address people open.

---

## 4. Updating

```bash
cd /srv/nordic-inventory
scripts/backup.sh                  # always back up first (section 5)
git pull
docker compose up -d --build       # rebuilds and restarts; migrations run automatically
docker compose ps                  # wait for "healthy"
```

Data in the volumes is kept. Users see a few seconds of downtime while the app restarts.

**To go back to an older version:** restore the backup taken just before the update (a
newer database may not work with older code). Then `git checkout <previous commit>` and
`docker compose up -d --build`.

`docker compose down` stops everything and keeps the data. `docker compose down -v` **deletes all data**.

---

## 5. Backups

Two things need backing up: the **database** and the **photos**. Both are covered by:

```bash
scripts/backup.sh /path/to/backups        # → /path/to/backups/2026-11-05_030000/{database.dump, photos.tar.gz}
```

- Safe while people are using the app.
- Keeps the newest 14 backups (`BACKUP_KEEP=30 scripts/backup.sh …` to change).
- Checks the dump and archive are valid, and exits with an error (non-zero) if anything failed.
- If your compose file lives elsewhere: `COMPOSE="docker compose -f /srv/nordic-inventory/docker-compose.yml"`.

Run it nightly with cron (`crontab -e`):

```
0 3 * * *  cd /srv/nordic-inventory && scripts/backup.sh /srv/backups/inventory >> /var/log/inventory-backup.log 2>&1
```

**Copy the backups off the server** (NAS, another machine, cloud storage). A backup on the
same disk doesn't survive that disk failing.

**Restore** (replaces all current data, asks you to type `restore` first):

```bash
scripts/restore.sh /srv/backups/inventory/2026-11-05_030000
```

It stops the app, replaces the database and photo folder, and starts the app again. A
backup from an older version of the app can be restored: newer migrations are applied
when the app starts. Do a test restore once (e.g. on a test machine) so you know it works.

**Without Docker Compose** (e.g. on Railway or with a managed database), the same backup by hand:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner > database.dump      # database
tar -C "$UPLOAD_DIR" -czf photos.tar.gz .                               # photos
# restore: pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" database.dump
#          tar -C "$UPLOAD_DIR" -xzf photos.tar.gz
```

---

## 6. Monitoring and logs

- **`GET /api/health`** needs no login. It returns `200 {"status":"ok"}`, or `503` with
  `"database":"error"` or `"photos":"error"` saying which part failed. Point an uptime monitor at
  `https://<your address>/api/health`.
- The container has a built-in health check: `docker compose ps` shows `healthy` or `unhealthy`.
- Logs: `docker compose logs -f app` (start-up, migrations, errors) and `docker compose logs -f db`.
- Both containers restart automatically (`restart: unless-stopped`), also after a server reboot
  (with Docker set to start on boot: `systemctl enable docker`).

---

## 7. Settings reference

All settings are environment variables, in `.env` (fully commented in `.env.example`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `APP_BASE_URL` | yes | – | Public address (https://…). Used in QR labels and for secure cookies. |
| `SESSION_SECRET` | yes | – | Protects login sessions (≥ 16 characters; use 48+ random). Changing it signs everyone out. |
| `POSTGRES_PASSWORD` | yes (compose) | – | Database password inside docker compose. |
| `DATABASE_URL` | yes (without compose) | – | PostgreSQL connection string. Set automatically by docker-compose.yml. |
| `UPLOAD_DIR` | | `/data/uploads` in Docker | Photo folder (a persistent volume). Photos are only served to signed-in users. |
| `AUTH_PROVIDER` | | `local` | `local` (passwords in this app) or `vms` (section 8). |
| `INITIAL_ADMIN_USERNAME` | | – | This user is created as an administrator if it doesn't exist yet. |
| `INITIAL_ADMIN_PASSWORD` | local only | – | Password for that user (local provider). Only used when the user is created. |
| `APP_TIMEZONE` | | `Europe/Copenhagen` | Time zone for dates and times shown (DD/MM/YYYY). |
| `APP_PORT` | | `3000` | Host port (docker compose), e.g. `127.0.0.1:3000`. |
| `DHL_TRACKING_URL_TEMPLATE` | | DHL Express tracking page | "Track with DHL" link; `{waybill}` is replaced. |
| `DHL_API_KEY` | | – (off) | Turns on automatic DHL tracking checks (developer.dhl.com, "Shipment Tracking - Unified"). |
| `DHL_CHECK_MINUTES` | | `60` | How often to check (min 15). Stays within the free 250 lookups/day. |

**DHL tracking**, when a key is set:
- It asks DHL about boxes in transit and marks the ones DHL reports as delivered, so someone confirms them with "Mark as arrived".
- It never marks a box as arrived by itself.
- If DHL can't be reached, the home page says so and nothing else is affected.

---

## 8. Connecting VMS logins

The goal: people sign in with their **Nordic VMS username and password**. All password
checking goes through one small interface, so this means implementing one function and
switching one setting.

### Where

| File | What it is |
|---|---|
| `src/server/auth/providers/vms.ts` | **The stub to implement.** Contains detailed TODO notes and example code for LDAP/AD, an HTTP login API, and a database lookup. |
| `src/server/auth/provider.ts` | The interface and the switch between providers. Nothing to change. |
| `src/server/auth/providers/local.ts` | The built-in provider, as a working example. |
| `src/server/auth/login.ts` | What happens after a successful check (user records, sessions). Nothing to change. |

### What `verifyCredentials` receives and must return

```ts
verifyCredentials(username: string, password: string): Promise<VerifyResult>
```

- `username`: what the person typed, with leading/trailing spaces removed. Case is kept.
  The app itself treats usernames case-insensitively and stores them lower-case.
- `password`: exactly what the person typed.

Return one of:

| Situation | Return |
|---|---|
| Correct username and password | `{ ok: true, displayName?: "Oliver Hansen", email?: "oliver@…" }` |
| Wrong username or password | `{ ok: false }` (the person sees "Wrong username or password", and it counts towards the rate limit) |
| VMS unreachable / unexpected error | `{ ok: false, error: "Can't reach VMS right now. Try again." }` (shown as-is; not counted as a failed attempt) |

- Don't throw for wrong credentials.
- Use a timeout (e.g. 10 s) for network calls.
- Never log passwords.
- `displayName` and `email` are optional. When given, they're stored and kept up to date at each login, and the name shows in the app and the history log.
- New settings (e.g. `VMS_LDAP_URL`) are read with `process.env`. Add them to `.env.example` and to this file.

### Switching over

1. Implement `verifyCredentials` in `vms.ts`.
2. In `.env`: `AUTH_PROVIDER=vms`, and `INITIAL_ADMIN_USERNAME=<your VMS username>`.
3. `docker compose up -d --build`.
4. Sign in with your VMS username and password. You're an administrator.

### Users and roles

- **Roles always live in this app** (`User` table), never in VMS. There are two:
  **administrator** (manages companies, locations and users) and **member** (everything else).
- **Someone's first VMS login creates their user, as a member.** No need to create users in advance.
- **Admins change roles and deactivate people under More → Users.** A deactivated user can't
  sign in even with a correct VMS password, and their history is kept.
- **The first admin:** at every start, if no user named `INITIAL_ADMIN_USERNAME` exists, it is
  created as an administrator. An existing user is never changed. This works on an empty
  database and on one that already has (local) users.
- **There is always at least one active admin.** The app refuses to demote or deactivate the last one.
- **Locked out of admin?** Promote someone directly in the database:
  ```bash
  docker compose exec db psql -U inventory -d inventory -c "UPDATE \"User\" SET role='ADMIN', active=true WHERE username='their.vms.username';"
  ```

### Moving from local logins to VMS

Existing users keep their records, history and roles, as long as their username here matches
their VMS username (compare case-insensitively). Their old local password is simply no longer
used. Deactivate local-only accounts that have no VMS equivalent (e.g. `admin`) under More → Users.

### Testing

`npm test` runs the automated tests (see README.md). To try the provider locally:
`AUTH_PROVIDER=vms npm run dev` and sign in at http://localhost:3000.

---

## 9. Railway (test deployment)

Railway runs the same Dockerfile. Postgres is a Railway add-on; photos go on a Railway volume.

1. New project → **Deploy from GitHub repo** → this repository. Railway finds the `Dockerfile`.
2. In the project: **+ New → Database → PostgreSQL**.
3. App service → **Variables**:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_BASE_URL=https://<the domain from step 5>
   SESSION_SECRET=<random, 48+ characters>
   AUTH_PROVIDER=local
   INITIAL_ADMIN_USERNAME=admin
   INITIAL_ADMIN_PASSWORD=<a strong password>
   UPLOAD_DIR=/data/uploads
   RAILWAY_RUN_UID=0
   ```
   `RAILWAY_RUN_UID=0` is needed because Railway mounts volumes as root, while the image
   runs as an unprivileged user that couldn't write photos otherwise.
4. App service → **+ Volume** (right-click the service, or Settings) → mount path `/data/uploads`.
5. App service → **Settings → Networking → Generate Domain**. Put that address in `APP_BASE_URL`.
6. App service → **Settings → Deploy → Healthcheck Path** `/api/health`.
7. Deploy. Migrations run on start; the health check turns green within about a minute.

Railway provides HTTPS itself. Scanning works on phones straight away.

**From Railway to VMS:**
- **Start fresh (simplest):** set up VMS as in section 2.
- **Keep the test data:** copy the database with `pg_dump` / `pg_restore` (section 5),
  using Railway's public `DATABASE_URL`, from the Postgres service → Connect.
  - Photos are on the Railway volume. One way to copy them (not tested here):
    `railway ssh` into the app service and run `tar` on `/data/uploads`.
  - Printed QR labels contain `APP_BASE_URL`, so labels printed during the test point at the
    Railway address. Reprint them, or keep the Railway domain redirecting to the new address.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | HTTPS inspection on the network. Add the root certificate to `docker/certs/` (section 1). |
| App container restarts, log says "Database migrations failed" | Database not reachable or wrong password. Check `docker compose logs db` and `POSTGRES_PASSWORD`. |
| Log says "Invalid configuration" | A required setting is missing or wrong. The message names it. |
| Pages load but every save fails ("Couldn't reach the server…"), and the app log says "does not match `origin` header" or "Invalid Server Actions request" | The proxy doesn't pass the original `Host` header (section 3). |
| Camera doesn't start on phones | The page isn't on HTTPS, or the person denied camera permission (browser site settings). |
| Photo uploads fail | Proxy body limit too small (needs ≥ 16 MB), or the photo folder isn't writable (`/api/health` shows `"photos":"error"`). |
| Everyone was signed out | `SESSION_SECRET` changed. Expected. |
| `/api/health` returns 503 | Its JSON says which part failed: `database` or `photos`. |

## Code overview

See README.md for development commands and the project layout. The stock rules
(packing, shipping, counting) are in `src/server/stock/` and `src/server/events.ts`. They are
covered by the automated tests in `tests/`, which run against a real PostgreSQL database.
