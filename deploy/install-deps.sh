#!/data/data/com.termux/files/usr/bin/bash
# 安装 Termux 依赖。默认装运行所需；--source 额外装编译链（golang + nodejs-lts）。
set -e
SOURCE=0
[ "$1" = "--source" ] && SOURCE=1

need=()
for c in git curl jq openssl python; do
  command -v "$c" >/dev/null 2>&1 || need+=("$c")
done
command -v python3 >/dev/null 2>&1 || need+=(python)

if [ "$SOURCE" = 1 ]; then
  command -v go >/dev/null 2>&1 || need+=(golang)
  command -v node >/dev/null 2>&1 || need+=(nodejs-lts)
  command -v npm >/dev/null 2>&1 || need+=(nodejs-lts)
fi

if [ "${#need[@]}" -gt 0 ]; then
  # 去重
  uniq_need=$(printf '%s\n' "${need[@]}" | awk '!seen[$0]++')
  echo "需要安装: $(echo "$uniq_need" | tr '\n' ' ')"
  pkg update -y >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  pkg install -y $uniq_need
else
  echo "依赖已齐全"
fi

# go 版本检查（源码编译需要 go 1.26+）
if [ "$SOURCE" = 1 ] && command -v go >/dev/null 2>&1; then
  GOV=$(go version | awk '{print $3}' | sed 's/go//')
  echo "go 版本: $GOV（需要 >= 1.26，低了就 pkg upgrade golang）"
fi
