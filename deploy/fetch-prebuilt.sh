#!/data/data/com.termux/files/usr/bin/bash
# 下载预编译的 grok2api（Android/aarch64，Termux 本机构建）+ 前端静态文件。
# 内容: grok2api 二进制 + frontend/dist + VERSION
# 来源: https://github.com/daodaoyu123/autojs6-grok/releases
# 可用 GROK2API_PREBUILT_URL 覆盖下载地址；GROK2API_HOME 覆盖安装目录。
set -e
ASSET="grok2api-android-arm64.tar.gz"
BASE_URL="${GROK2API_PREBUILT_URL:-https://github.com/daodaoyu123/autojs6-grok/releases/latest/download}"
VM="${GROK2API_HOME:-$HOME/repos/grok2api}"
TMP="$(mktemp -d "${TMPDIR:-$PREFIX/tmp}/g2a-prebuilt.XXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$VM"
echo "下载 $BASE_URL/$ASSET"
curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$TMP/$ASSET" "$BASE_URL/$ASSET"

if curl -fsL --retry 2 --max-time 30 -o "$TMP/$ASSET.sha256" "$BASE_URL/$ASSET.sha256" 2>/dev/null; then
  (cd "$TMP" && sha256sum -c "$ASSET.sha256") && echo "sha256 校验通过"
else
  echo "（无 sha256 校验文件，跳过校验）"
fi

tar -xzf "$TMP/$ASSET" -C "$VM"
chmod +x "$VM/grok2api"
[ -f "$VM/frontend/dist/index.html" ] || { echo "!! 包内容异常：缺 frontend/dist/index.html"; exit 1; }
echo "已安装到 $VM"
