#!/data/data/com.termux/files/usr/bin/bash
# 安装运行时脚本：~/bin 启动器与工具、工作区目录、开机自启。
# 默认不覆盖已存在文件（加 --force 覆盖）；--no-autostart 跳过自启钩子。
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WS="${GROK_WORKSPACE:-/storage/emulated/0/Hermes工作区/grok}"
AUTOSTART=1
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --autostart) AUTOSTART=1 ;;
    --no-autostart) AUTOSTART=0 ;;
    --force) FORCE=1 ;;
  esac
  shift
done

mkdir -p "$HOME/bin" "$HOME/.grok/logs" "$WS/log" \
         "/storage/emulated/0/Download/QQ/grok api" \
         "${GROK2API_HOME:-$HOME/repos/grok2api}/data"

copy_bin(){
  src="$1"; dst="$HOME/bin/$(basename "$1")"
  if [ -e "$dst" ] && [ "$FORCE" != 1 ]; then echo "  跳过(已存在): $(basename "$dst")"; return 0; fi
  install -m 755 "$src" "$dst"; echo "  + ~/bin/$(basename "$dst")"
}
copy_ws(){
  src="$1"; dst="$WS/$(basename "$1")"
  if [ -e "$dst" ] && [ "$FORCE" != 1 ]; then echo "  跳过(已存在): $(basename "$dst")"; return 0; fi
  install -m 644 "$src" "$dst"; echo "  + $dst"
}

echo "—— 启动器/工具 → ~/bin ——"
for f in "$ROOT"/grok2api/scripts/*; do copy_bin "$f"; done
for f in "$ROOT"/grok2api/tools/*; do copy_bin "$f"; done
copy_bin "$ROOT/autojs6/bridge/grok_signup_webview.py"

echo "—— 注册链工具 → 工作区 $WS ——"
copy_ws "$ROOT/grok2api/scripts/grok_oauth.py"
for f in "$ROOT"/autojs6/bridge/autojs_*.py; do copy_ws "$f"; done
copy_ws "$ROOT/autojs6/临时邮箱/signup_webview_template.js"
chmod +x "$WS"/autojs_*.py "$WS/grok_oauth.py" 2>/dev/null || true

if [ "$AUTOSTART" = 1 ]; then
  echo "—— 开机自启 ——"
  RC="$HOME/.bashrc"
  if ! grep -q "grok2api-up.sh" "$RC" 2>/dev/null; then
    cat >> "$RC" << 'EOF'

# ===== grok2api 自启（打开 Termux 时静默拉起，幂等）=====
[ -x "$HOME/bin/grok2api-up.sh" ] && "$HOME/bin/grok2api-up.sh" >/dev/null 2>&1
[ -x "$HOME/bin/grok-shim-up.sh" ] && "$HOME/bin/grok-shim-up.sh" >/dev/null 2>&1
EOF
    echo "  + ~/.bashrc 自启钩子"
  else
    echo "  ~/.bashrc 已有钩子，跳过"
  fi
  BOOT="$HOME/.termux/boot/00-grok-router.sh"
  if [ ! -f "$BOOT" ]; then
    mkdir -p "$HOME/.termux/boot"
    cat > "$BOOT" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Termux:Boot 开机自启（需安装 Termux:Boot 应用）
termux-wake-lock 2>/dev/null || true
/data/data/com.termux/files/home/bin/grok2api-up.sh
/data/data/com.termux/files/home/bin/grok-shim-up.sh
EOF
    chmod +x "$BOOT"
    echo "  + ~/.termux/boot/00-grok-router.sh（装了 Termux:Boot 应用才生效）"
  else
    echo "  Termux:Boot 脚本已存在，跳过"
  fi
fi
echo "运行时安装完成"
