# Deployment: Student Queueing System

Stack: Express 4, EJS, better-sqlite3, express-session, bcryptjs, zod. Node 22. Target: public URL for a one-day showcase with data that must survive the demo window.

## 1. Recommendation

- Primary: Pterodactyl with Cloudflare Tunnel. One process, a persistent `data` volume, and a dashboard-managed hostname. Setup: `docs/08a-pterodactyl-tunnel.md`.
- Hosted fallback: Railway with a persistent volume, or Render plus Turso when a disk is unavailable (https://docs.railway.com/reference/regions, https://render.com/docs/free). Railway keeps file-backed SQLite with almost no code change; Render free needs Turso and a network dependency.

## 2. Environment variables

| Variable | Production value | Notes |
|---|---|---|
| `NODE_ENV`, `PORT` | `production`, injected | Secure cookie defaults; do not hardcode the port. |
| `DATABASE_PATH`, `TZ` | `/data/app.db`, `Asia/Manila` | Database on the mounted volume; consistent times and logs. |
| `SESSION_SECRET` | 32+ random bytes | Generate once, store in host secrets. |
| `PUBLIC_BASE_URL` | `https://<host>` | Canonical links, sitemap, and redirects. |
| `COOKIE_SECURE` | `true` | Requires HTTPS; see https://expressjs.com/en/advanced/best-practice-security/. |
| `MAIL_DRIVER` | `brevo` | Production rejects `ethereal` and `memory`. |
| `MAIL_FROM`, `MAIL_REPLY_TO` | sender, optional reply-to | Sender must be on the verified Brevo domain. |
| `BREVO_API_KEY`, `MAIL_ENCRYPTION_KEY`, `AUTH_PEPPER` | secrets | HTTPS `api-key`, 32-byte base64 AES key, 32+ char HMAC key. |
| `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS` | `10`, `5`, `60` | Code lifetime, tries, and resend wait. |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | unset by default | Fallback only; keep the token secret. |

```dotenv
NODE_ENV=production
DATABASE_PATH=/data/app.db
SESSION_SECRET=replace-with-32-plus-random-bytes
PUBLIC_BASE_URL=https://your-app.up.railway.app
COOKIE_SECURE=true
TZ=Asia/Manila
MAIL_DRIVER=brevo
MAIL_FROM=Qampus <no-reply@mail.qampus.dpdns.org>
BREVO_API_KEY=
MAIL_ENCRYPTION_KEY=
AUTH_PEPPER=
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
```

## 3. Account mail and Brevo

- Verify `mail.qampus.dpdns.org` in Brevo. In Cloudflare DNS, add the DKIM and Brevo TXT records Brevo shows, SPF `v=spf1 include:spf.brevo.com ~all`, and a DMARC record. Do not enable Email Routing on that hostname.
- `MAIL_DRIVER=brevo` calls `POST https://api.brevo.com/v3/smtp/email` over HTTPS 443 with a 5-second timeout. Production fails fast if the driver, sender, keys, `AUTH_PEPPER`, or `PUBLIC_BASE_URL` is missing.
- `src/server.js` starts the in-process worker after listen, drains the outbox on boot, and wakes every 2 seconds. A failed code mail is recoverable with resend; a password-changed mail retries. Nothing is sent by a cron job.
- Brevo free is 300/day and adds "Sent with Brevo" branding. Confirm account activation and transactional sending before the demo; activation can require support.

## 4. Build and start

Railway (Nixpacks) reads `engines.node` or `.nvmrc`; pin Node 22.

```text
Build:  npm ci
Pre-deploy: npm run db:migrate
Start:  npm start
```

Render free uses the same commands and health check path `/health`. Bind `0.0.0.0` on `process.env.PORT`; hosts route only to that port.

## 5. SQLite pragmas and path rules

```js
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");
```

- Open the database once at process start and reuse the connection. `better-sqlite3` is synchronous, so one connection serializes writes; see https://sqlite.org/wal.html and https://sqlite.org/pragma.html.
- `journal_mode = WAL` creates `app.db-wal` and `app.db-shm`. They must sit beside `app.db` on the same volume, so never point `DATABASE_PATH` at a temp or read-only path.
- Run exactly one replica and apply migrations as a single writer before traffic. A second writer risks lock errors and duplicate seed work.

## 6. Migration, seed, and demo reset

```text
npm run db:migrate  # creates tables if absent, records applied versions
npm run db:seed     # idempotent baseline rows, safe to rerun
npm run demo:reset  # clears queue rows and reseeds demo data
```

- Guard every seed write with `INSERT ... ON CONFLICT DO NOTHING` or a version check.
- `demo:reset` is destructive. Require `--confirm`, take a backup first, and refuse when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=1`.
- Backup before reset: `sqlite3 "$DATABASE_PATH" ".backup '/data/app.db.bak'"`.

## 7. Health check and smoke test

`GET /health` returns `200` with JSON only when the process is serving, `SELECT 1` succeeds, and the schema version is current. It does not write on every poll. Return `503` with `{"status":"degraded","db":"unavailable"}` otherwise. Check both endpoints with the actual public URL, not localhost, before announcing the link:

```text
curl.exe -fsS https://HOST/health
curl.exe -fsS https://HOST/api/display
```

`/api/display` must return valid JSON with the waiting count.

## 8. Pre-demo checklist

| When | Checks |
|---|---|
| T-24h | Deploy the release tag; volume mounted; public `/health` is 200; `/api/display` returns JSON; staff login works; two test tickets survive a redeploy; Brevo domain verified and one code delivered; free trial expiry and quota checked at https://docs.railway.com/pricing/free-trial. |
| T-3h | Restart the service and confirm data persists; run seed check; verify `TZ` output; confirm `SESSION_SECRET` unchanged; test on mobile data; download a database backup. |
| T-30m | Hit `/health` and `/api/display`; log in once; create and call one ticket; open `https://HOST` on the demo device; keep the local fallback ready. |

## 9. Rollback

1. Tag each release, for example `demo-2026-10-21`.
2. Before changes, snapshot the database: `sqlite3 /data/app.db ".backup '/data/app.db.bak'"`. Use the platform volume backup if available (https://docs.railway.com/volumes).
3. Redeploy the previous tag and keep the volume mounted; do not recreate it.
4. If data is corrupted, stop the service, restore `app.db.bak` to `/data/app.db`, delete stale `app.db-wal` and `app.db-shm` only after the process is stopped, then start.
5. Recheck `/health`, `/api/display`, and one login before reopening the URL.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Ephemeral disk on Render free (https://render.com/docs/free) | Data lost on redeploy or restart | Use Turso, or use Railway primary. |
| `better-sqlite3` native build failure | Deploy fails on host | Pin Node 22, use prebuilt binaries, run `npm ci` in the host build. |
| Trial expiry or quota | Service stops mid-demo | Confirm expiry at https://docs.railway.com/pricing/free-trial; keep Render plus Turso ready. |
| Timezone mismatch | Wrong times on display | Set `TZ=Asia/Manila` and store UTC timestamps. |
| In-memory session store | Logout on restart or second instance | Use a SQLite or database-backed session store; one replica. |
| Single volume | Disk loss stops the app | Back up before the demo; keep a copy off the host. |
| Turso migration effort | Fallback is not instant | Accept `@libsql/client` differences; test the fallback path at T-24h. |

## 11. Local fallback runbook

Use if both hosted options fail. The laptop becomes the server on the venue LAN.

```dotenv
NODE_ENV=development
PORT=8080
DATABASE_PATH=./data/app.db
SESSION_SECRET=local-demo-secret-32-bytes-minimum
PUBLIC_BASE_URL=http://192.168.1.10:8080
COOKIE_SECURE=false
MAIL_DRIVER=ethereal
TZ=Asia/Manila
```

```text
npm ci
npm run db:migrate && npm run db:seed
npm start
ipconfig   # note the IPv4 address, update APP_BASE_URL
```

Open `http://<laptop-ip>:8080/health` from a phone on the same network. Allow Node through Windows Firewall on private networks. Keep the laptop plugged in, disable sleep, and do not close the terminal. If the LAN blocks client isolation, use a phone hotspot and share that URL.

This LAN fallback runs in development with Ethereal, so no Brevo key is needed and codes open from the server log; it is not the public configuration. `COOKIE_SECURE=false` is allowed only here. Do not use it with real student data, and rotate `SESSION_SECRET` after the demo.
