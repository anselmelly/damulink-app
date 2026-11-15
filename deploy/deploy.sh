#!/usr/bin/env bash
# Deploys a release to the server and switches to it, or rolls back by itself if the new version does not come up healthy.
#
#   deploy/deploy.sh deploy@dl.anselmelly.com                    check, build, upload, switch
#   deploy/deploy.sh deploy@dl.anselmelly.com path/to/release.tar.gz   upload an already built release
#
# The box is small (1 GB), so nothing is built there. Layout on the server (/srv/damulink):
#   releases/<stamp>/   one folder per release, the last 5 are kept
#   current -> releases/<stamp>    the live release (a symlink, switched in one step)
#   next    -> releases/<stamp>    the release being installed (used by the migration unit)
#   shared/api.env, web.env, backup.cnf, backups/    never replaced by a deploy
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:?usage: deploy.sh user@host [release.tar.gz]}"
# one connection for every step (one passphrase prompt, and well under the server's ssh rate limit)
OPTS=(-o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 -o ControlMaster=auto -o "ControlPath=/tmp/damulink-deploy-%C" -o ControlPersist=120)
SSH=(ssh "${OPTS[@]}" "$TARGET")
ROOT=/srv/damulink

if [[ -n "${2:-}" ]]; then
	TARBALL="$2"
else
	echo "==> running the checks (a red check stops the deploy)"
	pnpm check
	TARBALL="$(./deploy/build-release.sh | tail -1)"
fi
[[ -f "$TARBALL" ]] || { echo "no such release: $TARBALL" >&2; exit 1; }
NAME="$(basename "$TARBALL" .tar.gz)"

echo "==> uploading $NAME"
# start from a clean connection: a leftover one (from a stopped deploy) can hang the first step
ssh -O exit "${OPTS[@]}" "$TARGET" 2>/dev/null || true
echo "    connecting to $TARGET (if nothing happens: ssh-add your key first, a hidden passphrase window looks like a hang)"
"${SSH[@]}" "mkdir -p $ROOT/incoming $ROOT/releases"
scp -q "${OPTS[@]}" "$TARBALL" "$TARGET:$ROOT/incoming/"

echo "==> installing on the server"
# the quoted heredoc is sent as is; NAME and ROOT arrive as arguments
"${SSH[@]}" bash -s -- "$NAME" "$ROOT" <<'REMOTE'
set -euo pipefail
NAME="$1"; ROOT="$2"
REL="$ROOT/releases/$NAME"
PREV="$(readlink -f "$ROOT/current" 2>/dev/null || true)"

tar -xzf "$ROOT/incoming/$NAME.tar.gz" -C "$ROOT/releases"
rm -f "$ROOT/incoming/$NAME.tar.gz"

# 1. a copy of the database before anything changes (the credentials are in a file only this user can read)
mkdir -p "$ROOT/shared/backups"
DBNAME="$(sed -n 's/^DB_NAME=//p' "$ROOT/shared/api.env")"
mariadb-dump --defaults-extra-file="$ROOT/shared/backup.cnf" --single-transaction --routines "$DBNAME" | gzip > "$ROOT/shared/backups/before-$NAME.sql.gz"

# 2. the new release's migrations, run by a one-shot service that reads the secrets file (so no password is ever typed or printed)
ln -sfn "$REL" "$ROOT/next"
sudo /usr/bin/systemctl start damulink-migrate

# 3. switch, restart, and look
ln -sfn "$REL" "$ROOT/current"
sudo /usr/bin/systemctl restart damulink-api damulink-web

healthy() { curl -fsS -m 3 http://127.0.0.1:8790/api/health >/dev/null && curl -fsS -m 3 -o /dev/null http://127.0.0.1:3000/; }
ok=0
for _ in $(seq 1 20); do
	if healthy; then ok=1; break; fi
	sleep 1
done

if [[ "$ok" != 1 ]]; then
	echo "!! the new release did not become healthy: rolling back" >&2
	if [[ -n "$PREV" && -d "$PREV" ]]; then
		ln -sfn "$PREV" "$ROOT/current"
		sudo /usr/bin/systemctl restart damulink-api damulink-web
		sleep 3
		healthy && echo "rolled back to $(basename "$PREV")" >&2 || echo "!! still unhealthy after the rollback: look at: journalctl -u damulink-api -u damulink-web" >&2
	else
		echo "!! there was no earlier release to go back to" >&2
	fi
	exit 1
fi

echo "live: $NAME ($(head -1 "$REL/VERSION"))"
# keep the last 5 releases and the last 14 database copies
ls -1dt "$ROOT"/releases/damulink-* | tail -n +6 | xargs -r rm -rf
ls -1t "$ROOT"/shared/backups/before-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
REMOTE
echo "==> done"
