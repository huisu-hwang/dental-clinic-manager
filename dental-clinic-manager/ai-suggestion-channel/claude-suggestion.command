#!/bin/bash
# AI suggestion channel용 Claude Code 세션 (Terminal에서 직접 보이는 버전)
#
# Login Items에 등록되어 부팅/로그인 시 자동으로 Terminal 창이 열리고 실행됨.
# Claude가 종료되면 5초 후 자동 재시작 (무한 루프).
# 의도적으로 멈추려면 Ctrl-C, 종료하려면 Terminal 창 닫기.
#
# tmux/pm2 의존 없이 GUI Terminal 창 한 개로 운영.

cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager || exit 1

CLAUDE="/Users/hhs/.local/bin/claude"
CLAUDE_ARGS=(
  --dangerously-load-development-channels server:suggestion-inbox
  --permission-mode bypassPermissions
)

if [ ! -x "$CLAUDE" ]; then
  echo "[ERROR] $CLAUDE not found or not executable"
  read -r -p "Press Enter to exit..."
  exit 1
fi

while true; do
  echo
  echo "============================================================"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude 세션 시작"
  echo "============================================================"
  "$CLAUDE" "${CLAUDE_ARGS[@]}"
  ec=$?
  echo
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude 종료 (exit=$ec). 5초 후 재시작..."
  echo "  → 재시작 원치 않으면 Ctrl-C, 창 닫기로 완전 종료."
  sleep 5
done
