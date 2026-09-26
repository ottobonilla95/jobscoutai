[Unit]
Description=Back up {{name}} SQLite using its online backup API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory={{installDirectory}}
ExecStart=/usr/bin/docker compose --profile worker run --rm --no-deps worker node --import tsx scripts/backup.ts
TimeoutStartSec=5min
