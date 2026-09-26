#!/data/data/com.termux/files/usr/bin/bash
# 把 AutoJs6 注册脚本部署到手机存储目录（可重复执行；默认不覆盖已存在文件，--force 覆盖）。
#
# 目标目录（与注册链脚本内的写死路径一致，所以别改）：
#   D1 = /storage/emulated/0/Auto js6/域名邮箱注册      （主力流程：域名邮箱 + QQ 守望）
#   D2 = /storage/emulated/0/Auto js6/grok              （临时邮箱 / Outlook / Console 脚本，AutoJs6 里手动跑）
#   D3 = /storage/emulated/0/Hermes工作区/grok           （Termux 侧工具与数据；ol_batch 从这里下发）
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=0
[ "$1" = "--force" ] && FORCE=1
D1="/storage/emulated/0/Auto js6/域名邮箱注册"
D2="/storage/emulated/0/Auto js6/grok "
D3="${GROK_WORKSPACE:-/storage/emulated/0/Hermes工作区/grok}"
mkdir -p "$D1/log" "$D2" "$D3/log" "$HOME/bin" "/storage/emulated/0/Download/QQ/grok api"

put(){ src="$1" dst="$2"
  if [ -e "$dst" ] && [ "$FORCE" != 1 ]; then echo "  跳过(已存在): $dst"; return 0; fi
  install -m 644 "$src" "$dst"; echo "  + $dst"; }
putx(){ src="$1" dst="$2"
  if [ -e "$dst" ] && [ "$FORCE" != 1 ]; then echo "  跳过(已存在): $dst"; return 0; fi
  install -m 755 "$src" "$dst"; echo "  + $dst"; }

echo "—— 1) 域名邮箱注册（主力流程）→ $D1 ——"
for f in "域名邮箱注册.js" "收验证码守望.py" "说明.md"; do
  put "$ROOT/autojs6/域名邮箱注册/$f" "$D1/$f"
done

echo "—— 2) 临时邮箱（DuckMail）→ $D2 ——"
for f in "$ROOT"/autojs6/临时邮箱/*.js; do put "$f" "$D2/$(basename "$f")"; done
put "$ROOT/autojs6/临时邮箱/signup_webview_template.js" "$D3/signup_webview_template.js"

echo "—— 3) Outlook 注册链 → $D2 + $D3 ——"
for f in "$ROOT"/autojs6/outlook/*.js; do
  put "$f" "$D2/$(basename "$f")"
  put "$f" "$D3/$(basename "$f")"
done
for f in "$ROOT"/autojs6/outlook/*.sh "$ROOT"/autojs6/outlook/*.py; do
  putx "$f" "$D3/$(basename "$f")"
done

echo "—— 4) Console 入职 → $D2 ——"
for f in "$ROOT"/autojs6/console/*.js; do put "$f" "$D2/$(basename "$f")"; done

echo "—— 5) AutoJs6 桥（Termux 下发）→ $D3 + ~/bin ——"
for f in "$ROOT"/autojs6/bridge/autojs_*.py; do putx "$f" "$D3/$(basename "$f")"; done
putx "$ROOT/autojs6/bridge/grok_signup_webview.py" "$HOME/bin/grok_signup_webview.py"

echo "—— 6) 设备码 OAuth 服务 → $D3 ——"
put "$ROOT/grok2api/scripts/grok_oauth.py" "$D3/grok_oauth.py"

cat << 'EOF'

部署完成。AutoJs6 侧还要做三件事（打开 AutoJs6 应用）：
  1. 授予权限：存储（管理所有文件）、无障碍服务、后台运行不受限制
  2. 侧边抽屉 → 打开「服务端模式」（端口 7347，Termux 侧脚本要靠它下发）
  3. 脚本目录设为 /storage/emulated/0/Auto js6/，就能看到刚放进去的脚本

跑注册前先起收码守望（域名邮箱流程）：
  bash ~/bin/start-watch.sh
或临时邮箱/Outlook 流程：见 docs/02-AutoJS6注册部署.md
EOF
