#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# autojs6-grok 一键部署（Android + Termux）
#
# 在一台新设备上：
#   pkg install -y git
#   git clone https://github.com/daodaoyu123/autojs6-grok.git
#   cd autojs6-grok
#   bash deploy/deploy.sh                 # 默认：预编译包优先，失败自动转源码编译
#
# 可选参数：
#   --from-source   强制源码编译（需 golang + nodejs，15~30 分钟）
#   --with-autojs6  同时把 AutoJs6 注册脚本部署到手机存储目录
#   --port N        监听端口（默认 8000）
#   --no-autostart  不写开机自启（~/.bashrc 钩子 + Termux:Boot）
#   --no-verify     跳过部署后验证
#   --force         覆盖已存在的配置文件并重装运行时脚本
# ============================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=8000
FROM_SOURCE=0
FORCE=0
AUTOSTART=1
WITH_AUTOJS6=0
NO_VERIFY=0
VM="${GROK2API_HOME:-$HOME/repos/grok2api}"

usage(){ sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --from-source) FROM_SOURCE=1 ;;
    --port) PORT="$2"; shift ;;
    --force) FORCE=1 ;;
    --no-autostart) AUTOSTART=0 ;;
    --with-autojs6) WITH_AUTOJS6=1 ;;
    --no-verify) NO_VERIFY=1 ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
  shift
done

step(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok(){ printf '\033[0;32m  ✓ %s\033[0m\n' "$*"; }
warn(){ printf '\033[0;33m  ! %s\033[0m\n' "$*"; }
die(){ printf '\033[0;31m  ✗ %s\033[0m\n' "$*"; exit 1; }

# ---------- 0. 环境检查 ----------
step "环境检查"
case "$PREFIX" in *com.termux*) ok "Termux 环境" ;; *) die "请在 Termux 里运行（当前 PREFIX=$PREFIX）" ;; esac
ARCH=$(uname -m); ok "架构 $ARCH"
if [ "$ARCH" != "aarch64" ]; then
  warn "非 aarch64：预编译包不可用，改用源码编译"
  FROM_SOURCE=1
fi
if [ ! -d /sdcard ] && [ ! -d /storage/emulated/0 ]; then
  die "没有手机存储权限：先在 Termux 运行 termux-setup-storage 并允许"
fi
ok "存储可访问"
WS="${GROK_WORKSPACE:-/storage/emulated/0/Hermes工作区/grok}"
mkdir -p "$HOME/repos" "$HOME/bin" "$HOME/.grok/logs" "$WS/log" "/storage/emulated/0/Download/QQ/grok api"

# ---------- 1. 依赖 ----------
step "安装依赖"
if [ "$FROM_SOURCE" = 1 ]; then
  bash "$ROOT/deploy/install-deps.sh" --source
else
  bash "$ROOT/deploy/install-deps.sh"
fi

# ---------- 2. grok2api 本体 ----------
if [ -x "$VM/grok2api" ] && [ "$FORCE" != 1 ]; then
  ok "已存在 $VM/grok2api（要重装加 --force，要编译加 --from-source）"
elif [ "$FROM_SOURCE" = 1 ]; then
  step "源码编译 grok2api（含 Termux 补丁）"
  bash "$ROOT/deploy/build-grok2api.sh"
else
  step "下载预编译包（失败自动转源码编译）"
  if bash "$ROOT/deploy/fetch-prebuilt.sh"; then
    ok "预编译包就绪"
  else
    warn "预编译包下载失败，转源码编译"
    bash "$ROOT/deploy/install-deps.sh" --source
    bash "$ROOT/deploy/build-grok2api.sh"
  fi
fi

# ---------- 3. 配置 ----------
step "生成配置"
if [ "$FORCE" = 1 ]; then
  bash "$ROOT/deploy/gen-config.sh" --port "$PORT" --force
else
  bash "$ROOT/deploy/gen-config.sh" --port "$PORT"
fi

# ---------- 4. 运行时 ----------
step "安装运行时脚本"
if [ "$AUTOSTART" = 1 ]; then RT="--autostart"; else RT="--no-autostart"; fi
if [ "$FORCE" = 1 ]; then bash "$ROOT/deploy/install-runtime.sh" "$RT" --force; else bash "$ROOT/deploy/install-runtime.sh" "$RT"; fi

# ---------- 5. 启动 + 验证 ----------
step "启动 grok2api"
"$HOME/bin/grok2api-up.sh" "$PORT"
UP=0
for i in $(seq 1 30); do
  if curl -s -m2 -o /dev/null "http://127.0.0.1:$PORT/healthz"; then UP=1; break; fi
  sleep 1
done
[ "$UP" = 1 ] || die "健康检查失败，看 $VM/grok2api.log"
ok "服务已启动：http://127.0.0.1:$PORT"

if [ "$NO_VERIFY" = 0 ]; then
  step "部署验证"
  if bash "$ROOT/deploy/verify.sh" --port "$PORT"; then
    ok "验证全部通过"
  else
    warn "验证未全过（看上面输出；账号未导入时对话测试会失败，属正常）"
  fi
fi

# ---------- 6. AutoJs6（可选） ----------
if [ "$WITH_AUTOJS6" = 1 ]; then
  step "部署 AutoJs6 注册脚本"
  bash "$ROOT/deploy/deploy-autojs6.sh"
fi

# ---------- 7. 总结 ----------
step "部署完成"
cat << EOF
  管理台:    http://127.0.0.1:$PORT        （账号密码见 ~/grok2api_admin.txt）
  客户端 Key: ~/grok2api_keys.txt
  数据目录:  $VM
  日志:      $VM/grok2api.log

下一步:
  1. 造号/导入账号（见 docs/02-AutoJS6注册部署.md、docs/03-使用教程.md）
  2. 冒烟：
       python3 ~/bin/g2a_smoke.py
  3. 接入自己的程序 / Hermes / grok CLI（见 docs/03-使用教程.md）

提示: 首次进入管理台会要求登录，密码在 ~/grok2api_admin.txt（600 权限，勿外传）。
EOF
