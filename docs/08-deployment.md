# Deployment: Student Queueing System

Stack: Express 4, EJS, better-sqlite3, express-session, bcryptjs, zod. Node 22. Target: public URL for a one-day showcase with data that must survive the demo window.

## 1. Recommendation

- Primary: Pterodactyl with Cloudflare Tunnel. One process, a persistent `data` volume, and a dashboard-managed hostname. Setup: `docs/08a-pterodactyl-tunnel.md`.
- Hosted fallback: Railway trial with a persistent volume, or Render plus Turso when a disk is unavailable. Region list: https://docs.railway.com/reference/regions. Render limits: https://render.com/docs/free.
- Tradeoff: Railway with a volume gives file-backed SQLite persistence with almost no code change, while Render free survives only if data lives in Turso, which requires a small data-layer change and network dependency.

## 2. Environment variables

| Variable | Production value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookie defaults. |
| `PORT` | injected by host | Do not hardcode in production. |
| `DATABASE_PATH` | `/data/app.db` | Must be on the mounted volume. |
| `SESSION_SECRET` | 32+ random bytes | Generate once, store in host secrets. |
| `PUBLIC_BASE_URL` | `https://<host>` | Used for canonical links, sitemap, and redirects. |
| `COOKIE_SECURE` | `true` | Requires HTTPS; see https://expressjs.com/en/advanced/best-practice-security/. |
| `TZ` | `Asia/Manila` | Keeps displayed times and logs consistent. |
| `TURSO_DATABASE_URL` | unset by default | Fallback only, `libsql://...`. |
| `TURSO_AUTH_TOKEN` | unset by default | Fallback only, keep secret. |

```dotenv
NODE_ENV=production
PORT=8080
DATABASE_PATH=/data/app.db
SESSION_SECRET=replace-with-32-plus-random-bytes
PUBLIC_BASE_URL=https://your-app.up.railway.app
COOKIE_SECURE=true
TZ=Asia/Manila
# Turso fallback only
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

## 3. Build and start

Railway (Nixpacks) reads `engines.node` or `.nvmrc`; pin Node 22.

```text
Build:  npm ci
Pre-deploy: npm run db:migrate
Start:  npm start
```

Render free uses the same commands. Set build to `npm ci`, start to `npm start`, health check path to `/health`.

The server must bind explicitly, since hosts route only to the provided port:

```js
const port = Number(process.env.PORT) || 8080;
app.listen(port, "0.0.0.0", () => console.log(`listening on ${port}`));
```

## 4. SQLite pragmas and path rules

```js
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");
```

- Open the database once at process start and reuse the connection. `better-sqlite3` is synchronous, so one connection serializes writes.
- WAL, `busy_timeout`, and `foreign_keys` behavior: https://sqlite.org/wal.html and https://sqlite.org/pragma.html.
- `journal_mode = WAL` creates `app.db-wal` and `app.db-shm`. They must sit beside `app.db` on the same volume, so never point `DATABASE_PATH` at a temp or read-only path.
- Run exactly one replica. A second process writing the same volume risks lock errors and duplicate seed work.
- Apply migrations as a single writer before traffic, not from every request.

## 5. Migration, seed, and demo reset

```text
npm run db:migrate  # creates tables if absent, records applied versions
npm run db:seed     # idempotent baseline rows, safe to rerun
npm run demo:reset  # clears queue rows and reseeds demo data
```

- Guard every seed write with `INSERT ... ON CONFLICT DO NOTHING` or a version check.
- `demo:reset` is destructive. Require `--confirm`, take a backup first, and refuse when `NODE_ENV=production` unless `ALLOW_DEMO_RESET=1`.
- Backup before reset: `sqlite3 "$DATABASE_PATH" ".backup '/data/app.db.bak'"`.

## 6. Health check and smoke test

`GET /health` returns `200` with JSON only when the process is serving, `SELECT 1` succeeds, and the schema version is current. It does not write on every poll. Return `503` with `{"status":"degraded","db":"unavailable"}` otherwise.

```text
curl.exe -fsS https://HOST/health
curl.exe -fsS https://HOST/api/display
```

`/api/display` must return valid JSON with the waiting count. Check it with the actual public URL, not localhost, before announcing the link.

## 7. Pre-demo checklist

| When | Checks |
|---|---|
| T-24h | Deploy the release tag; volume mounted; public `/health` is 200; `/api/display` returns JSON; staff login works; two test tickets survive a redeploy; free trial expiry and quota checked at https://docs.railway.com/pricing/free-trial. |
| T-3h | Restart the service and confirm data persists; run seed check; verify `TZ` output; confirm `SESSION_SECRET` unchanged; test on mobile data; download a database backup. |
| T-30m | Hit `/health` and `/api/display`; log in once; create and call one ticket; open `https://HOST` on the demo device; keep the local fallback ready. |

## 8. Rollback

1. Tag each release, for example `demo-2026-10-21`.
2. Before changes, snapshot the database: `sqlite3 /data/app.db ".backup '/data/app.db.bak'"`. Use the platform volume backup if available (https://docs.railway.com/volumes).
3. Redeploy the previous tag and keep the volume mounted; do not recreate it.
4. If data is corrupted, stop the service, restore `app.db.bak` to `/data/app.db`, delete stale `app.db-wal` and `app.db-shm` only after the process is stopped, then start.
5. Recheck `/health`, `/api/display`, and one login before reopening the URL.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Ephemeral disk on Render free (https://render.com/docs/free) | Data lost on redeploy or restart | Use Turso, or use Railway primary. |
| Cold starts and idle spin-down on Render free (https://render.com/docs/free) | Slow first request during demo | Warm up at T-30m; keep Railway primary. |
| `better-sqlite3` native build failure | Deploy fails on host | Pin Node 22, use prebuilt binaries, run `npm ci` in the host build. |
| Trial expiry or quota | Service stops mid-demo | Confirm expiry at https://docs.railway.com/pricing/free-trial; keep Render plus Turso ready. |
| Timezone mismatch | Wrong times on display | Set `TZ=Asia/Manila` and store UTC timestamps. |
| In-memory session store | Logout on restart or second instance | Use a SQLite or database-backed session store; one replica. |
| Single volume | Disk loss stops the app | Back up before the demo; keep a copy off the host. |
| Turso migration effort | Fallback is not instant | Accept `@libsql/client` differences; test the fallback path at T-24h. |

## 10. Local fallback runbook

Use if both hosted options fail. The laptop becomes the server on the venue LAN.

```dotenv
NODE_ENV=production
PORT=8080
DATABASE_PATH=./data/app.db
SESSION_SECRET=local-demo-secret-32-bytes-minimum
APP_BASE_URL=http://192.168.1.10:8080
COOKIE_SECURE=false
TRUST_PROXY=0
TZ=Asia/Manila
```

```text
npm ci
npm run db:migrate && npm run db:seed
npm start
ipconfig   # note the IPv4 address, update APP_BASE_URL
```

Open `http://<laptop-ip>:8080/health` from a phone on the same network. Allow Node through Windows Firewall on private networks. Keep the laptop plugged in, disable sleep, and do not close the terminal. If the LAN blocks client isolation, use a phone hotspot and share that URL.

`COOKIE_SECURE=false` is allowed only for this HTTP LAN fallback. It is a local exception, not the public deployment. Do not use the LAN mode with real student data, and rotate `SESSION_SECRET` after the demo.
