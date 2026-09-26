#!/data/data/com.termux/files/usr/bin/bash
# 8800 → 8000 转发（旧书签兼容）幂等启动器
PORT=8800
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
  exit 0
fi
# 上游 grok2api 必须先在
[ -x "$HOME/bin/grok2api-up.sh" ] && "$HOME/bin/grok2api-up.sh" >/dev/null 2>&1
mkdir -p "$HOME/.grok/logs"
setsid nohup python3 "$HOME/bin/grok-8800-alias.py" >> "$HOME/.grok/logs/alias8800.log" 2>&1 </dev/null &
sleep 1
exit 0
