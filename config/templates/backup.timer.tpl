[Unit]
Description=Daily {{name}} database backup

[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
Unit={{servicePrefix}}-backup.service

[Install]
WantedBy=timers.target
