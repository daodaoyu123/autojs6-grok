#!/data/data/com.termux/files/usr/bin/bash
# grok CLI → grok2api 转换层（127.0.0.1:8802）幂等启动器
# 旧地址兼容：8800 → 8000 透明转发（每次拉起都先确保它在）
[ -x "$HOME/bin/grok-8800-up.sh" ] && "$HOME/bin/grok-8800-up.sh" >/dev/null 2>&1
PORT=8802
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
  exit 0
fi
# 上游 grok2api 也要在
[ -x "$HOME/bin/grok2api-up.sh" ] && "$HOME/bin/grok2api-up.sh" >/dev/null 2>&1
mkdir -p "$HOME/.grok/logs"
setsid nohup python3 "$HOME/bin/grok-cli-shim.py" >> "$HOME/.grok/logs/shim.log" 2>&1 </dev/null &
sleep 1
exit 0
