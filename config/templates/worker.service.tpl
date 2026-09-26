[Unit]
Description=Check and run due {{name}} searches
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory={{installDirectory}}
ExecStart=/usr/bin/docker compose --profile worker run --rm --no-deps worker
TimeoutStartSec=12min
