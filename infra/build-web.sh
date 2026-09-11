#!/usr/bin/env bash
# Build the Next.js web app on a remote machine and install the production output here.
# Full `next build` is not allowed on yusam. Hosts, tried in order unless BUILD_HOST is set:
#   rog  — Milad's ROG laptop over the reverse tunnel (yusam:20422), node 20 via nvm
#   nuc  — the mofids NUC: source synced through the `mc` container (/host = NUC root),
#          built with docker node:20-alpine on the host via the `nuc` shell
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
WEB="$PWD"
pick_host() {
  if [ -n "${BUILD_HOST:-}" ]; then echo "$BUILD_HOST"; return; fi
  if timeout 3 bash -c "</dev/tcp/127.0.0.1/${BUILD_SSH_PORT:-20422}" 2>/dev/null; then echo rog; else echo nuc; fi
}
HOST=$(pick_host)
echo "build host: $HOST"
rm -rf .next-prod
if [ "$HOST" = rog ]; then
  SSH="ssh -p ${BUILD_SSH_PORT:-20422} -i $HOME/.ssh/laptop_tunnel -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
  TARGET=milad@localhost
  DIR='~/build/algoty-web'
  $SSH $TARGET "mkdir -p $DIR"
  rsync -az --delete --exclude node_modules --exclude '.next*' --exclude '.env*' -e "$SSH" ./ "$TARGET:$DIR/"
  $SSH $TARGET "cd $DIR && export PATH=\$HOME/.nvm/versions/node/v20.19.1/bin:\$PATH && npm ci --no-audit --no-fund >/dev/null && npx next build 2>&1 | tail -30"
  rsync -az -e "$SSH" "$TARGET:$DIR/.next/" ./.next-prod/
else
  # The mc container has no rsync: stream tar archives over ssh instead. node_modules stays on the NUC between builds.
  SSH="ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=20"
  tar czf - --exclude=node_modules --exclude='.next*' --exclude='.env*' . | $SSH mc 'D=/host/root/build/algoty-web; mkdir -p $D && find $D -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} + && tar xzf - -C $D'
  nuc 'cd /root/build/algoty-web && docker run --rm -v /root/build/algoty-web:/app -w /app -e NEXT_TELEMETRY_DISABLED=1 node:20-alpine sh -c "npm ci --no-audit --no-fund >/dev/null 2>&1 && npx next build 2>&1 | tail -30" && test -s .next/BUILD_ID'
  mkdir -p .next-prod
  $SSH mc 'tar czf - -C /host/root/build/algoty-web/.next .' | tar xzf - -C .next-prod
fi
test -s .next-prod/BUILD_ID
cd "$WEB/../.."
pm2 stop exchange-lab-web >/dev/null
rm -rf apps/web/.next && mv apps/web/.next-prod apps/web/.next
pm2 start infra/ecosystem.config.cjs --only exchange-lab-web --update-env >/dev/null
sleep 3; curl -s -o /dev/null -w 'web %{http_code} in %{time_total}s\n' http://127.0.0.1:18200/trade
