# Deploying DamuLink to one server

One Debian box runs everything: MariaDB, the API (Node), the website (Node) and Caddy in front for HTTPS.
The box is small (1 GB), so **nothing is built on it**: the release is built on your machine, uploaded, and switched in one step.

```
Caddy (443)  ──  /api/*  ──▶  API      127.0.0.1:8790   ──▶  MariaDB
             └─  /*      ──▶  website  127.0.0.1:3000
```

## Files here

| File | What it is |
|---|---|
| `build-release.sh` | Builds one release: the API and the migration runner bundled into single files, the SQL migrations, and the website. Packs `dist-release/damulink-<stamp>.tar.gz` (about 2 MB). Needs only Node on the server. |
| `deploy.sh` | Uploads a release and switches to it. Backs up the database first, runs the migrations, switches, restarts, checks health, and **rolls back by itself** if the new version does not come up. |
| `systemd/` | `damulink-api`, `damulink-web` (the two services) and `damulink-migrate` (a one-shot used by the deploy). Memory-capped and sandboxed. |
| `Caddyfile` | The site address, automatic HTTPS, security headers, and the `/api` split. |
| `api.env.example`, `web.env.example` | The names of the settings each service reads. The real values live only on the server. |
| `sudoers-damulink` | Lets the `deploy` user restart exactly those services and nothing else. |

## Layout on the server (`/srv/damulink`)

```
releases/<stamp>/   one folder per release (the last 5 are kept)
current -> releases/<stamp>     the live release
next    -> releases/<stamp>     the release being installed
shared/api.env  web.env  backup.cnf  backups/    never touched by a deploy
```

## What the server needs before the first deploy (plan 27, steps 1 to 9)

`deploy` user with your key and `/srv/damulink/{releases,shared,incoming}` owned by it; Node 24; MariaDB with a `damulink` database and user;
Caddy; the three unit files in `/etc/systemd/system` (the two services enabled); `shared/api.env` and `web.env` filled in (mode 600, never printed
or committed); `shared/backup.cnf` (`[client]` user and password for `mariadb-dump`, mode 600); the sudoers file in `/etc/sudoers.d` (mode 440);
the Caddyfile in `/etc/caddy`; and a DNS A record for `dl.anselmelly.com` (DNS only, not proxied, so Caddy can get its certificate).

## Everyday use

```bash
deploy/deploy.sh deploy@dl.anselmelly.com          # checks, builds, uploads, switches (stops if a check is red)
deploy/build-release.sh                            # just build a release locally
deploy/deploy.sh deploy@dl.anselmelly.com dist-release/damulink-<stamp>.tar.gz   # upload one you already built
```

On the server:

```bash
journalctl -u damulink-api -u damulink-web -f      # logs
sudo systemctl restart damulink-api                # restart one service
ls -t /srv/damulink/releases                       # releases, newest first
ls -t /srv/damulink/shared/backups                 # database copies, one before every deploy
```

## Demo data (optional, run by hand)

`api/seed-demo.mjs` adds invented facilities, a team at each, 14 donors, and at Rift County Hospital some requests, a live call and two drives.
It only **adds what is missing**: it never updates a row, skips any facility whose name already exists, and every demo account uses `@demo.example`.
On the server, from `/srv/damulink/current`:

```bash
set -a; . /srv/damulink/shared/api.env; set +a
node api/seed-demo.mjs /srv/damulink/shared/demo-accounts.txt   # writes the logins (mode 600); the password is never printed
```

Sign in with a demo email, the password in that file, and the facility code. Running it again changes nothing.

## Rolling back by hand

```bash
ln -sfn /srv/damulink/releases/<older-stamp> /srv/damulink/current
sudo systemctl restart damulink-api damulink-web
```

The database is **not** rolled back with the code. Migrations must therefore keep the previous release working (add a column or table first,
use it in the next release, drop things later). If a migration itself went wrong, restore from `shared/backups/before-<release>.sql.gz`.

## Things to know

- **Mail and SMS are not connected.** In production the server only logs who a message was for. Sign-up codes and email links will not reach anyone until a real provider is added (the code has one place for it).
- **Secrets stay out of git and out of logs.** `OTP_FIXED_CODE` is development-only: the server refuses to start with it in production.
- **No background jobs yet.** When reminders and clean-ups arrive they get their own timer unit next to these.
