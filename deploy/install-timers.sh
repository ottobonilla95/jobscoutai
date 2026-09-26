#!/usr/bin/env bash
# Generated from config/product.json and config/templates; run npm run brand:sync.
set -euo pipefail
if [ "${EUID}" -ne 0 ]; then
  echo 'Run this script with sudo on the DigitalOcean server.' >&2
  exit 1
fi
if [ ! -f /opt/job-searcher/runtime/bin/node ]; then
  echo 'Put the project in /opt/job-searcher first, or update config/product.json and run npm run brand:sync.' >&2
  exit 1
fi
install -m 644 deploy/scout-worker.service deploy/scout-worker.timer deploy/scout-backup.service deploy/scout-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now scout-worker.timer
systemctl list-timers scout-worker.timer scout-backup.timer
