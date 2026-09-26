[Unit]
Description=Check the {{name}} search schedule every minute

[Timer]
OnBootSec=1min
OnUnitInactiveSec=1min
AccuracySec=5s
Unit={{servicePrefix}}-worker.service

[Install]
WantedBy=timers.target
