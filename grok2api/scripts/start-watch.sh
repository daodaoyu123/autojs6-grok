#!/data/data/com.termux/files/usr/bin/sh
# 一键启动收验证码守望，并挂起 OAuth 控制服务（127.0.0.1:8799）。
# 守望：会话还在、日志 90 秒内有更新，就不动。否则停掉旧的再拉起。
# 控制服务：/ping 已通则不动，否则 nohup 挂起 grok_oauth.py。
# 用法: sh ~/bin/start-watch.sh
set -e
REG="/storage/emulated/0/Auto js6/域名邮箱注册"
LOG="$REG/log/watch_run.txt"
SESSION="watch_otp"
OAUTH_ROOT="/storage/emulated/0/Hermes工作区/grok"
OAUTH_LOG="$OAUTH_ROOT/log/grok_oauth.log"
OAUTH_PORT=8799
mkdir -p "$REG/log" "$OAUTH_ROOT/log"

oauth_up() {
  curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$OAUTH_PORT/ping"
}

ensure_oauth() {
  if oauth_up; then
    echo "控制服务已在运行（127.0.0.1:$OAUTH_PORT）"
    return 0
  fi
  setsid nohup python3 "$OAUTH_ROOT/grok_oauth.py" >> "$OAUTH_LOG" 2>&1 < /dev/null &
  i=0
  while [ "$i" -lt 15 ]; do
    if oauth_up; then
      echo "控制服务已挂起（127.0.0.1:$OAUTH_PORT）"
      return 0
    fi
    i=$((i + 1))
    sleep 0.4
  done
  echo "控制服务未起来，看日志: $OAUTH_LOG" >&2
  return 1
}

session_up() {
  tmux has-session -t "$SESSION" 2>/dev/null
}

fresh() {
  [ -f "$LOG" ] || return 1
  python3 - "$LOG" << 'PY'
import os, sys, time
raise SystemExit(0 if time.time() - os.path.getmtime(sys.argv[1]) < 90 else 1)
PY
}

if session_up && fresh; then
  echo "守望已在运行，未重复启动"
  ensure_oauth
  exit 0
fi

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$REG" \
  "python3 -u '收验证码守望.py' >> 'log/watch_run.txt' 2>&1"
echo "守望已启动（tmux 会话 $SESSION）"
echo "看日志: tail -f '$LOG'"
ensure_oauth
