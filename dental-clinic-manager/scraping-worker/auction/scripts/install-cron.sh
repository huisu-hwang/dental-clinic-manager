#!/usr/bin/env bash
# Mac mini M4: 매일 새벽 03:00 KST 실행

set -e
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${WORKER_DIR}/logs"
mkdir -p "${LOG_DIR}"

CRON_LINE="0 3 * * * cd ${WORKER_DIR} && /usr/local/bin/node dist/jobs/dailyScrape.js >> ${LOG_DIR}/cron.log 2>&1"

( crontab -l 2>/dev/null | grep -v 'dailyScrape.js' ; echo "${CRON_LINE}" ) | crontab -

echo "Installed cron:"
crontab -l | grep dailyScrape
