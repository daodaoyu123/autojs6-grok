#!/data/data/com.termux/files/usr/bin/bash
# 从源码编译 grok2api（上游 v3.1.6 + Termux 硬链接补丁）。
#
# 关键坑（务必遵守）：
#   1. Termux 上编译后端不要显式 GOOS=linux CGO_ENABLED=0 —— 纯 Go 解析器读不到
#      /etc/resolv.conf（Android 没有），所有出站 DNS 全挂。用默认目标即可。
#   2. 前端 pnpm 必须用 11.5.2（项目 packageManager 锁定）；高版本会去找
#      @pnpm/exe 的 android 原生包（不存在）而失败。
#
# 可用环境变量覆盖：GROK2API_HOME（安装目录）、GROK2API_TAG（默认 v3.1.6）、
# GROK2API_REPO（默认上游仓库）。
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VM="${GROK2API_HOME:-$HOME/repos/grok2api}"
TAG="${GROK2API_TAG:-v3.1.6}"
REPO="${GROK2API_REPO:-https://github.com/chenyme/grok2api.git}"
PATCH="$ROOT/grok2api/patches/termux-media-hardlink.patch"

command -v go >/dev/null 2>&1 || { echo "缺少 go：先 bash deploy/install-deps.sh --source"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "缺少 node：先 bash deploy/install-deps.sh --source"; exit 1; }

echo "== 1/4 获取源码 $TAG =="
if [ -d "$VM/.git" ]; then
  git -C "$VM" fetch --tags origin || true
else
  git clone "$REPO" "$VM"
fi
DIRTY="$(git -C "$VM" status --porcelain 2>/dev/null | grep -v '^??' | head -1 || true)"
if [ -n "$DIRTY" ]; then
  echo "!! $VM 有未提交改动，为避免覆盖已停止。请处理后重跑，或设 GROK2API_HOME 指向别处。"
  git -C "$VM" status --porcelain | grep -v '^??' | head -10
  exit 1
fi
git -C "$VM" checkout -f "$TAG"

echo "== 2/4 应用 Termux 补丁 =="
if grep -q "commitNoReplace" "$VM/backend/internal/infra/media/local_store.go" 2>/dev/null; then
  echo "补丁已存在，跳过"
elif patch -p1 -d "$VM" --dry-run -f < "$PATCH" >/dev/null 2>&1; then
  patch -p1 -d "$VM" -f < "$PATCH"
  echo "补丁已应用"
else
  echo "!! 补丁无法应用（源码版本可能不匹配）"; exit 1
fi

echo "== 3/4 编译前端（pnpm@11.5.2）=="
PNPM="$HOME/.pnpm11/bin/pnpm"
if [ ! -x "$PNPM" ]; then
  npm i -g --prefix "$HOME/.pnpm11" pnpm@11.5.2
fi
cd "$VM/frontend"
"$PNPM" install --frozen-lockfile --fetch-timeout 300000 --fetch-retries 6
"$PNPM" build

echo "== 4/4 编译后端（Termux 默认目标，勿加 GOOS/CGO）=="
if [ -z "${GOPROXY:-}" ]; then
  echo "（提示：国内网络慢可先 export GOPROXY=https://goproxy.cn,direct）"
fi
cd "$VM/backend"
go build -buildvcs=false -trimpath -ldflags="-s -w" -o ../grok2api ./cmd/grok2api

cd "$VM"
ls -la grok2api frontend/dist/index.html
echo "编译完成: $VM/grok2api"
