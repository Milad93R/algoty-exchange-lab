#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BACKUP=/root/algoty-before-exchange-$(date -u +%Y%m%dT%H%M%SZ).conf
cp /etc/nginx/sites-enabled/algoty "$BACKUP"
install -m 644 "$ROOT/infra/nginx-proxy.conf" /etc/nginx/snippets/exchange-lab-proxy.conf
install -m 644 "$ROOT/infra/nginx-limits.conf" /etc/nginx/conf.d/exchange-lab-limits.conf
cat "$ROOT/infra/algoty.nginx.conf" > /etc/nginx/sites-enabled/algoty
if ! nginx -t; then cat "$BACKUP" > /etc/nginx/sites-enabled/algoty; exit 1; fi
systemctl reload nginx
printf 'Activated; previous config: %s\n' "$BACKUP"
