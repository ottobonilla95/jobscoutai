[Unit]
Description=Back up {{name}} PostgreSQL using pg_dump
After=network-online.target

[Service]
Type=oneshot
User=jobscout
Group=jobscout
WorkingDirectory={{installDirectory}}
ExecStart={{installDirectory}}/runtime/bin/node --env-file=.env --import tsx scripts/backup.ts
TimeoutStartSec=5min
UMask=0077
