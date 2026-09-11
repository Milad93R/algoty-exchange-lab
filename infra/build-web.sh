#!/usr/bin/env bash
# Build the Next.js web app on Milad's ROG laptop (reverse tunnel yusam:20422) and
# install the production output here. Full `next build` is not allowed on yusam.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
SSH="ssh -p ${BUILD_SSH_PORT:-20422} -i $HOME/.ssh/laptop_tunnel -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
HOST=milad@localhost
DIR='~/build/algoty-web'
$SSH $HOST "mkdir -p $DIR"
rsync -az --delete --exclude node_modules --exclude '.next*' --exclude '.env*' -e "$SSH" ./ "$HOST:$DIR/"
$SSH $HOST "cd $DIR && export PATH=\$HOME/.nvm/versions/node/v20.19.1/bin:\$PATH && npm ci --no-audit --no-fund >/dev/null && npx next build 2>&1 | tail -30"
rm -rf .next-prod
rsync -az -e "$SSH" "$HOST:$DIR/.next/" ./.next-prod/
cd ..; cd ..
pm2 stop exchange-lab-web >/dev/null
rm -rf apps/web/.next && mv apps/web/.next-prod apps/web/.next
pm2 start infra/ecosystem.config.cjs --only exchange-lab-web --update-env >/dev/null
sleep 3; curl -s -o /dev/null -w 'web %{http_code} in %{time_total}s\n' http://127.0.0.1:18200/trade
