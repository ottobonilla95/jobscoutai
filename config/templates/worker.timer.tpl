[Unit]
Description=Check the {{name}} search schedule every 15 minutes

[Timer]
OnBootSec=1min
OnUnitInactiveSec=15min
AccuracySec=5s
Unit={{servicePrefix}}-worker.service

[Install]
WantedBy=timers.target
