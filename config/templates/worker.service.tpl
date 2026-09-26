[Unit]
Description=Check and run due {{name}} searches
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=jobscout
Group=jobscout
WorkingDirectory={{installDirectory}}
Environment=NODE_ENV=production
ExecStart={{installDirectory}}/runtime/bin/node --env-file=.env --import tsx apps/worker/src/index.ts
TimeoutStartSec=12min
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
