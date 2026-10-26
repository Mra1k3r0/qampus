# 08a Pterodactyl and Cloudflare Tunnel

Use this when the app runs in a Pterodactyl Node.js container and the public URL is a Cloudflare Tunnel hostname. The tunnel is optional and off by default.

## 1. Pterodactyl setup

- Use a Node.js 22 egg. Set the startup command to `npm start`.
- Mount a persistent volume at the project `data` directory. Keep `DATABASE_PATH` inside it, for example `data/cspc_queue.sqlite`.
- Set the allocation port in the panel, then expose the same value as `PORT` or `SERVER_PORT`. The app binds `0.0.0.0`.
- Run one process only. SQLite with WAL expects a single writer.

## 2. Cloudflare dashboard

1. Open Cloudflare Zero Trust, then Networks, then Tunnels.
2. Create a Cloudflared tunnel and copy the tunnel token.
3. Add a public hostname, for example `queue.example.com`.
4. Set the service to `HTTP` and the URL to `127.0.0.1:<PORT>`, using the same port the app listens on.
5. Save the tunnel. The hostname appears in the tunnel log after cloudflared registers.

The token is a secret. Put it in the panel variables or `.env`, never in git or the repository.

## 3. Environment variables

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_PATH=data/cspc_queue.sqlite
SESSION_SECRET=replace-with-32-plus-random-bytes
PUBLIC_BASE_URL=https://queue.example.com
COOKIE_SECURE=true
TUNNEL=true
CLOUDFLARED_TOKEN=replace-with-the-tunnel-token
TUNNEL_HOSTNAME=queue.example.com
CLOUDFLARED_VERSION=2026.10.4
```

- `TUNNEL=true` starts cloudflared after the local `/health` check passes.
- `TUNNEL_HOSTNAME` is the domain the operator expects. It is used in logs and readiness output. The actual ingress comes from the dashboard.
- `CLOUDFLARED_VERSION` defaults to the pinned release in `src/tunnel.js`.
- `CLOUDFLARED_BIN` points at an existing cloudflared binary and skips the download.
- `CLOUDFLARED_EXTRA_ARGS` accepts extra flags, for example `--protocol http2` when the container blocks UDP.
- `PUBLIC_BASE_URL` must match the public hostname. A mismatch breaks canonical links, the sitemap, and redirects.

When the token is empty, the app falls back to a quick tunnel with a random `trycloudflare.com` URL. That mode is only for local testing; it cannot serve the configured domain.

## 4. Startup behavior

The server opens SQLite, migrates, seeds an empty database, and starts listening. It then calls `/health` on `127.0.0.1` before starting the tunnel. If the app is unhealthy, the download fails, the token is rejected, or cloudflared does not register within 30 seconds, the app logs a warning and keeps serving locally. The Node process stays up so the panel does not restart-loop.

cloudflared is downloaded from the pinned GitHub release into `~/.cache/qampus/bin` on Linux, or `%LOCALAPPDATA%\qampus\bin` on Windows. Set `CLOUDFLARED_CACHE_DIR` to override the cache path. If the panel blocks GitHub downloads, install cloudflared in the image and set `CLOUDFLARED_BIN`.

On `SIGTERM` or `SIGINT`, the server closes HTTP, stops cloudflared, and closes SQLite.

## 5. Verify

```text
npm run db:migrate
npm start
```

Then check, in order:

1. Panel console logs `server listening`.
2. Panel console logs `[tunnel] exposing http://127.0.0.1:<PORT>`.
3. Panel console logs `[tunnel] public URL: https://queue.example.com`.
4. `https://queue.example.com/health` returns `{"status":"ok","db":"ok"}`.
5. `https://queue.example.com/api/display` returns JSON.
6. Sign in with the staff account, call a ticket, and reload the display.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| App starts but domain is down | Tunnel log token or dashboard ingress; confirm the public hostname is attached to the tunnel. |
| `app not responding` warning | The port in `PORT` or `SERVER_PORT` does not match the listening port, or `/health` is failing. |
| `ingress points at ...` warning | Dashboard service URL uses a different port or path than the local app. |
| Download fails | Set `CLOUDFLARED_BIN` to an installed binary, or allow GitHub releases from the container. |
| Login redirects or cookies fail | Set `NODE_ENV=production`, `COOKIE_SECURE=true`, and `PUBLIC_BASE_URL=https://...`. Pterodactyl plus Cloudflare supplies the forwarded HTTPS protocol. |
| Tunnel disconnects with UDP errors | Add `CLOUDFLARED_EXTRA_ARGS=--protocol http2` and restart. |
| SQLite data disappears | `DATABASE_PATH` is outside the persistent volume. Move it under `data` on the mounted directory. |
