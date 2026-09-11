#!/usr/bin/env bash
set -euo pipefail
pm2 stop exchange-lab-web exchange-lab-core exchange-lab-matching >/dev/null
docker stop exchange-lab-postgres >/dev/null
