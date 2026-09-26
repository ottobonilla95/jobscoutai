#!/usr/bin/env bash
set -euo pipefail
if [ "${EUID}" -ne 0 ]; then
  echo 'Run this script with sudo on the DigitalOcean server.' >&2
  exit 1
fi
if [ ! -f {{installDirectory}}/runtime/bin/node ]; then
  echo 'Put the project in {{installDirectory}} first, or update config/product.json and run npm run brand:sync.' >&2
  exit 1
fi
install -m 644 deploy/{{servicePrefix}}-worker.service deploy/{{servicePrefix}}-worker.timer deploy/{{servicePrefix}}-backup.service deploy/{{servicePrefix}}-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now {{servicePrefix}}-worker.timer
systemctl list-timers {{servicePrefix}}-worker.timer {{servicePrefix}}-backup.timer
