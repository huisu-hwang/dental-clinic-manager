#!/bin/bash
# ai-suggestion-channel용 Claude Code 세션 상시 구동 스크립트
#
# 동작:
# - tmux detached 세션 "claude-suggestion"에 claude CLI 기동
# - 세션이 죽으면 스크립트도 종료 (pm2가 restart)
# - stdin/stdout은 tmux pty 기반 → Bubble Tea/TUI 정상
#
# 사용자 attach: `tmux attach -t claude-suggestion`
# detach: Ctrl-b d
# detach 후에도 Claude는 계속 실행 — 이벤트 수신 가능

set -u

SESSION="claude-suggestion"
REPO="/Users/hhs/Project/dental-clinic-manager/dental-clinic-manager"
TMUX="/opt/homebrew/bin/tmux"
CLAUDE="/Users/hhs/.local/bin/claude"

# Claude CLI: --dangerously-load-development-channels + acceptEdits 모드
# settings.local.json의 allow 리스트가 Bash 허용 범위를 좁게 제어
CLAUDE_ARGS="--dangerously-load-development-channels server:suggestion-inbox --permission-mode acceptEdits"

# 필수 바이너리 체크
for bin in "$TMUX" "$CLAUDE"; do
  if [ ! -x "$bin" ]; then
    echo "[launch-session] ERROR: $bin not found or not executable" >&2
    exit 1
  fi
done

# 이미 실행 중이면 monitor만 돌림
if ! "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
  echo "[launch-session] $(date) starting tmux session '$SESSION'"
  # tmux 세션 생성 후 안에서 claude 실행
  # `; sleep 60` 꼬리는 claude가 exit해도 세션이 즉시 닫히지 않게 완충 (디버깅용)
  "$TMUX" new-session -d -s "$SESSION" -c "$REPO" \
    "$CLAUDE $CLAUDE_ARGS; echo 'claude exited, sleeping 60s for inspection'; sleep 60"
else
  echo "[launch-session] $(date) tmux session '$SESSION' already running — attaching monitor"
fi

# 세션 생존 감시. 죽으면 스크립트도 종료 → pm2가 재시작
while true; do
  if ! "$TMUX" has-session -t "$SESSION" 2>/dev/null; then
    echo "[launch-session] $(date) session '$SESSION' disappeared — exiting (pm2 will restart)"
    exit 1
  fi
  sleep 30
done
