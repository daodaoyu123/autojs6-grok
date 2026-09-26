#!/data/data/com.termux/files/usr/bin/bash
# grok_oauth.py 幂等启动器（设备码 token 服务，127.0.0.1:8799）
ROOT="${GROK_WORKSPACE:-/storage/emulated/0/Hermes工作区/grok}"
PORT="${1:-8799}"
if curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/ping"; then
  exit 0
fi
cd "$ROOT" || exit 1
setsid nohup python3 "$ROOT/grok_oauth.py" >> "$ROOT/log/grok_oauth.log" 2>&1 < /dev/null &
sleep 1
exit 0
