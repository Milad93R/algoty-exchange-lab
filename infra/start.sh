#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p .runtime
chmod 700 .runtime
if [ ! -f .runtime/database.env ]; then
 python3 - <<'PY'
import secrets,os
os.umask(0o077)
open('.runtime/database.env','w').write('POSTGRES_USER=exchange\nPOSTGRES_DB=exchange\nPOSTGRES_PASSWORD='+secrets.token_hex(24)+'\n')
PY
fi
if [ ! -f .runtime/ai.env ]; then
 python3 - <<'INIT'
import secrets,os
os.umask(0o077)
open('.runtime/ai.env','w').write('AI_INTERNAL_TOKEN='+secrets.token_hex(32)+'\n')
INIT
fi
if ! docker inspect exchange-lab-postgres >/dev/null 2>&1; then
 docker run -d --name exchange-lab-postgres --restart unless-stopped --memory 256m --env-file .runtime/database.env -p 127.0.0.1:18204:5432 -v exchange-lab-postgres:/var/lib/postgresql/data postgres:16-alpine >/dev/null
else docker start exchange-lab-postgres >/dev/null; fi
for i in $(seq 1 30); do docker exec exchange-lab-postgres pg_isready -U exchange -d exchange >/dev/null && break; sleep 1; done
set -a
source .runtime/database.env
DB_PASSWORD=$POSTGRES_PASSWORD
export DB_PASSWORD
set +a
pm2 start infra/ecosystem.config.cjs --update-env

if [ -f .runtime/ai.env ]; then bash infra/start-v2.sh; fi
