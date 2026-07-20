# Quickstart: Deploying PatchPlanner to Production

This is the runbook for taking a built copy of PatchPlanner from a
laptop to a live, HTTPS-secured, auto-restarting deployment on one small
VPS. Follow it in order the first time; after that, "Deploying a new
version" below is the only section you need for routine updates.

## Prerequisites (one-time, before the first deploy)

1. **A server**: any small Linux VPS (1 vCPU / 1 GB RAM is plenty for
   this workload) with a public IP address, reachable over SSH.
2. **A domain name**: an A/AAAA DNS record pointing at the server's IP
   (e.g. `patchplanner.example.com`). Certbot (below) needs this
   resolving correctly before it can obtain a TLS certificate.
3. **A production Google OAuth client**: reuse the same Google Cloud
   project from local dev (`specs/014-auth/quickstart.md`), but add the
   production callback URL to the *same* OAuth client's authorized
   redirect URIs — e.g.
   `https://patchplanner.example.com/api/v1/auth/google/callback`.
   Forgetting this step is the single most common cause of a
   `redirect_uri_mismatch` error on a freshly deployed instance.
4. **nginx, Certbot, and a systemd-based init system** on the server —
   on Debian/Ubuntu:
   ```bash
   apt install nginx certbot python3-certbot-nginx
   ```
   (systemd ships with essentially every modern Linux distribution
   already).

## Building

From the repository root:

```bash
make build
```

This runs `npm run build` (frontend) first, producing `frontend/dist`,
then `go build` (backend), which embeds that directory into the
resulting binary. The output is a single executable at
`backend/patchplanner` — that binary, plus the `backend/migrations/`
directory, are the only two things that need to reach the server.

## Getting the build onto the server

```bash
scp backend/patchplanner user@your-server:/opt/patchplanner/
scp -r backend/migrations user@your-server:/opt/patchplanner/
```

(Any transfer method works — `scp`/`rsync` is the simplest for a single
small VPS, matching this project's "no CI/CD pipeline yet" scope.)

## Configuring the environment

Create `/opt/patchplanner/patchplanner.env` on the server (outside the
repo, never committed) with production values for every variable listed
in the README's Configuration tables, at minimum:

```bash
PATCHPLANNER_ADDR=127.0.0.1:7331
PATCHPLANNER_DB=/opt/patchplanner/patchplanner.db
PATCHPLANNER_MIGRATIONS=/opt/patchplanner/migrations
PATCHPLANNER_FRONTEND_URL=https://patchplanner.example.com
PATCHPLANNER_GOOGLE_CLIENT_ID=...
PATCHPLANNER_GOOGLE_CLIENT_SECRET=...
PATCHPLANNER_GOOGLE_REDIRECT_URL=https://patchplanner.example.com/api/v1/auth/google/callback
PATCHPLANNER_ALLOWED_EMAILS=you@example.com,collaborator@example.com
```

Note `PATCHPLANNER_ADDR` is bound to `127.0.0.1`, not a public
interface — the Go process is only ever reached through nginx, never
directly.

## Setting up the reverse proxy (nginx + Certbot)

1. Copy `deploy/nginx.conf.example` to
   `/etc/nginx/sites-available/patchplanner`, replacing the placeholder
   domain with your real one, then enable it:
   ```bash
   ln -s /etc/nginx/sites-available/patchplanner /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
2. Obtain the certificate and let Certbot rewrite the config for HTTPS
   automatically:
   ```bash
   certbot --nginx -d patchplanner.example.com
   ```
   Certbot installs its own systemd timer for automatic renewal — no
   manual certificate management afterward.

The example config already includes the `X-Forwarded-Proto` header the
application relies on to mark the session cookie `Secure` correctly
(unlike some reverse proxies, nginx does not add this header on its
own) — if you write your own config instead of starting from the
example, don't drop that line.

## Setting up the service (systemd)

Copy `deploy/patchplanner.service` to
`/etc/systemd/system/patchplanner.service`, adjust paths if you didn't
use `/opt/patchplanner`, then:

```bash
systemctl daemon-reload
systemctl enable --now patchplanner
```

`enable` makes it start automatically on boot; the unit's
`Restart=on-failure` makes it restart automatically if the process ever
exits unexpectedly.

## Verifying the deployment

1. Visit `https://patchplanner.example.com` — the full application
   should load from that one address.
2. Confirm `http://patchplanner.example.com` (no `s`) redirects to the
   `https://` version automatically.
3. Sign in with Google — you should land back in the app, signed in,
   with no browser security warning.
4. Refresh the browser on a deep link (e.g. an event detail page) —
   it should load correctly, not show a routing error.
5. Simulate a crash: `systemctl kill patchplanner`, then confirm
   `systemctl status patchplanner` shows it running again within a few
   seconds.

## Setting up backups

Copy `deploy/backup.sh.example` to the server, adjust its paths, and add
it to `cron` (e.g. daily at 3am):

```bash
0 3 * * * /opt/patchplanner/backup.sh
```

The script uses SQLite's own `.backup` command (safe to run against a
live database), not a raw file copy, to avoid ever capturing a
mid-write, corrupted snapshot.

## Deploying a new version

1. `make build` locally.
2. Copy the new `backend/patchplanner` binary to the server, replacing
   the old one (and `backend/migrations/` too, if this release added
   any).
3. `systemctl restart patchplanner`. Migrations run automatically on
   startup, exactly as they do in dev.

There is deliberately no zero-downtime/rolling-restart mechanism at this
scale — a `systemctl restart` is a few seconds of unavailability, judged
acceptable for a single small deployment (spec.md Assumptions).
