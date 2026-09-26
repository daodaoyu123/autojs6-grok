#!/data/data/com.termux/files/usr/bin/bash
# 部署后验证：健康检查 → 管理端登录 → 客户端 Key → 模型列表 →（可选）真实对话。
#   --port N   端口（默认 8000）
#   --chat     追加真实对话测试（需要池里至少有一个可用账号）
set -e
PORT=8000
WITH_CHAT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift ;;
    --chat) WITH_CHAT=1 ;;
  esac
  shift
done
export G2A_BASE="http://127.0.0.1:$PORT"
PASS=0; FAIL=0
t(){ if eval "$2" >/dev/null 2>&1; then echo "  ✓ $1"; PASS=$((PASS+1)); else echo "  ✗ $1"; FAIL=$((FAIL+1)); fi; }

echo "验证目标: $G2A_BASE"
t "健康检查 GET /healthz" "curl -sf -m5 '$G2A_BASE/healthz'"
t "管理端登录" "python3 '$HOME/bin/g2a_admin.py' login"

if [ -s "$HOME/grok2api_keys.txt" ]; then
  echo "  ✓ 客户端 Key 已存在"
  PASS=$((PASS+1))
else
  if python3 "$HOME/bin/g2a_admin.py" key deploy >/dev/null 2>&1; then
    echo "  ✓ 已创建客户端 Key（~/grok2api_keys.txt）"
    PASS=$((PASS+1))
  else
    echo "  ✗ 创建客户端 Key 失败"
    FAIL=$((FAIL+1))
  fi
fi

KEY="$(awk -F'\t' 'NF==3 && $3!="" {k=$3} END{print k}' "$HOME/grok2api_keys.txt" 2>/dev/null)"
t "模型列表 GET /v1/models" "curl -sf -m10 -H 'Authorization: Bearer $KEY' '$G2A_BASE/v1/models' | grep -q '\"id\"'"

if [ "$WITH_CHAT" = 1 ]; then
  t "真实对话（g2a_smoke.py）" "python3 '$HOME/bin/g2a_smoke.py'"
fi

echo
echo "通过 $PASS / 失败 $FAIL"
[ "$FAIL" = 0 ]
