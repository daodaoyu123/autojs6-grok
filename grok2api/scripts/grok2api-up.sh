#!/data/data/com.termux/files/usr/bin/bash
# grok2api 幂等启动器（本机 127.0.0.1:8000）
ROOT="${GROK2API_HOME:-$HOME/repos/grok2api}"
PORT="${1:-8000}"
if curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/healthz"; then
  exit 0
fi
cd "$ROOT" || exit 1
setsid nohup ./grok2api --config "$ROOT/config.yaml" --listen "127.0.0.1:$PORT" >> "$ROOT/grok2api.log" 2>&1 < /dev/null &
sleep 1
exit 0
