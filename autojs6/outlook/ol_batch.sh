#!/data/data/com.termux/files/usr/bin/bash
# ol_batch.sh v2 —— Outlook 全自动批量注册(零人工): 长按求解器 + e2e 一条龙
# 用法: ol_batch.sh [轮数=3] [间隔秒=330]
#   每轮自动下发: aj6_chal_color.js(长按求解器, 零截图 + 9.5s 长按) + aj6_ol_e2e.js(注册链)
#   人机验证全自动; 求解器自动重试 6 次仍全败才震动转人工(本轮再多等 10 分钟)
#   每轮最多尝试 2 次; "被阻止"立即停止(IP 被标记 -> 换 VPN 节点后重跑)
#   每轮开始先清残留引擎(killall), 防双求解器互踩
# 日志: log/ol_batch.log(总) log/ol_e2e.txt(当轮) log/chal_color.txt(求解器)
DIR="/storage/emulated/0/Hermes工作区/grok"
LOG="$DIR/log/ol_e2e.txt"
CHAL="$DIR/log/chal_color.txt"
BATCH="$DIR/log/ol_batch.log"
POOL="$DIR/outlook-accounts.txt"
ROUNDS=${1:-3}
GAP=${2:-330}
ROUND_TIMEOUT=1500
cd "$DIR" || exit 1

log(){ echo "[$(date +%H:%M:%S)] $*" >> "$BATCH"; }
pool_n(){ wc -l < "$POOL" 2>/dev/null || echo 0; }
push(){ timeout 60 python3 "$DIR/autojs_run.py" "$1" --wait 8 >/dev/null 2>&1; }
killall_aj6(){ timeout 40 python3 "$DIR/autojs_run.py" aj6_killall.js --wait 8 >/dev/null 2>&1; }

engine_ok(){
  python3 - <<'PYEOF'
import socket, sys
s = socket.socket(); s.settimeout(3)
try:
    s.connect(("127.0.0.1", 7347)); print("ok"); sys.exit(0)
except Exception as e:
    print("fail", e); sys.exit(1)
finally:
    s.close()
PYEOF
}

push_round(){
  : > "$LOG"; : > "$CHAL"
  killall_aj6; sleep 2
  push aj6_chal_color.js; sleep 2; push aj6_ol_e2e.js
  for w in $(seq 1 18); do grep -q "流程开始" "$LOG" 2>/dev/null && return 0; sleep 5; done
  log "  [!] 首轮下发未启动, 清场重发"
  killall_aj6; sleep 2
  push aj6_chal_color.js; sleep 2; push aj6_ol_e2e.js
  for w in $(seq 1 18); do grep -q "流程开始" "$LOG" 2>/dev/null && return 0; sleep 5; done
  return 1
}

wait_round(){
  local t0=$(date +%s) lastbeat=$t0 warned="" hdl=""
  while :; do
    if grep -q "E2E 结束" "$LOG" 2>/dev/null; then grep "E2E 结束" "$LOG" | tail -1; return 0; fi
    local el=$(( $(date +%s) - t0 ))
    if [ -z "$warned" ] && grep -q "未过 -> 转人工" "$CHAL" 2>/dev/null; then
      warned=1; hdl=$(( $(date +%s) + 600 ))
      log "  !! 求解器自动 6 次仍全败(已震动) — 在手机旁的话请手动长按; 本轮再等最多 10 分钟"
    fi
    if [ -n "$hdl" ] && [ "$(date +%s)" -gt "$hdl" ]; then log "  !! 人工窗口超时"; return 1; fi
    if [ "$el" -gt "$ROUND_TIMEOUT" ]; then log "  !! 本轮超时 ${ROUND_TIMEOUT}s"; return 1; fi
    if [ $(( $(date +%s) - lastbeat )) -ge 60 ]; then
      lastbeat=$(date +%s)
      log "  [心跳] 第 $i 轮进行中 $((el/60))m$((el%60))s; 最近: $(tail -1 "$LOG" 2>/dev/null | cut -c1-56)"
    fi
    sleep 10
  done
}

for f in aj6_killall.js aj6_chal_color.js aj6_ol_e2e.js; do
  [ -f "$DIR/$f" ] || { log "!! 缺少脚本 $f"; exit 1; }
done
log "===== 全自动批量 v2 开始: $ROUNDS 轮, 间隔 ${GAP}s ====="
if ! engine_ok >/dev/null; then log "!! AutoJs6 服务端(7347)不可达 — 请在 AutoJs6 侧边抽屉开启「服务端模式」"; exit 1; fi
log "前置检查 OK (7347 可达, 脚本齐)"

OK=0; FAIL=0; STOP=0
for i in $(seq 1 "$ROUNDS"); do
  before=$(pool_n)
  round_ok=0
  for a in 1 2; do
    log "--- 第 $i/$ROUNDS 轮 · 尝试 $a/2 (池现有 $before 条) ---"
    if ! push_round; then
      log "  !! 下发没启动"
      if [ "$a" -ge 2 ]; then log "  !! 两次下发都失败, 停止"; STOP=1; break; fi
      sleep 15; continue
    fi
    if ! wait_round; then
      if [ "$a" -ge 2 ]; then STOP=1; fi
      break
    fi
    RES=$(grep "E2E 结束" "$LOG" | tail -1)
    ACC=$(grep "^\[.*\] 账号: " "$LOG" | tail -1)
    log "  结果: $RES"
    [ -n "$ACC" ] && log "  $ACC"
    case "$RES" in
      *成功*) round_ok=1; break ;;
      *被阻止*) log "  !! IP 被微软标记, 批量停止 — 换 VPN 节点后重跑"; STOP=1; break ;;
      *) if [ "$a" -eq 1 ]; then log "  本轮未成功, 25s 后重试"; sleep 25; else log "  !! 两次都未成功"; STOP=1; break; fi ;;
    esac
  done
  after=$(pool_n)
  if [ "$round_ok" -eq 1 ]; then
    OK=$((OK+1)); log "  ✓ 第 $i/$ROUNDS 轮成功 (池 $before -> $after, 新增 $((after-before)))"
  else
    FAIL=$((FAIL+1)); log "  ✗ 第 $i/$ROUNDS 轮未成功"
  fi
  [ "$STOP" -eq 1 ] && break
  if [ "$i" -lt "$ROUNDS" ] && [ "$GAP" -gt 0 ]; then log "  休息 ${GAP}s 后继续"; sleep "$GAP"; fi
done
log "===== 批量结束: 成功 $OK / 失败 $FAIL; 池共 $(pool_n) 条 (最新: $(awk -F'----' 'END{print $1}' "$POOL")) ====="
