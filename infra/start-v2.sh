#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
source .runtime/database.env
source .runtime/ai.env
if [ -f .runtime/google.env ]; then source .runtime/google.env; fi
if [ -f .runtime/mail.env ]; then source .runtime/mail.env; fi
DB_PASSWORD=$POSTGRES_PASSWORD
EXECUTION_STATE="$PWD/.runtime/live-execution.json"
set +a
pm2 restart exchange-lab-core --update-env >/dev/null
if pm2 describe exchange-live-market >/dev/null 2>&1; then
 pm2 restart exchange-live-market --update-env >/dev/null
else
 pm2 start "$PWD/services/market-go/market" --name exchange-live-market --interpreter none --max-memory-restart 300M >/dev/null
fi
if pm2 describe exchange-mission-worker >/dev/null 2>&1; then
 pm2 restart exchange-mission-worker --update-env >/dev/null
else
 pm2 start "$PWD/workers/mission-python/service.py" --name exchange-mission-worker --interpreter python3 --max-memory-restart 220M >/dev/null
fi
