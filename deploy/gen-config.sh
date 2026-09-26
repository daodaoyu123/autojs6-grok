#!/data/data/com.termux/files/usr/bin/bash
# 生成 grok2api 真实配置（config.yaml）与管理员密码文件。
#   - 三处占位符替换成随机新值：jwtSecret / credentialEncryptionKey / 管理员密码
#   - 管理员密码写入 ~/grok2api_admin.txt（600 权限）
#   - 已存在 config.yaml 时默认保留（加 --force 才覆盖重生成）
# 注意：credentialEncryptionKey 写入账号后不能更换，否则已有凭据无法解密！
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VM="${GROK2API_HOME:-$HOME/repos/grok2api}"
PORT=8000
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift ;;
    --force) FORCE=1 ;;
  esac
  shift
done

DEST="$VM/config.yaml"
ADMIN="$HOME/grok2api_admin.txt"
if [ -f "$DEST" ] && [ "$FORCE" != 1 ]; then
  echo "config.yaml 已存在，保留不动（--force 覆盖重生成）"
  exit 0
fi

JWT="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
ENC="$(python3 -c 'import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())')"
PW="$(python3 -c 'import secrets, string; print("".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(18)))')"

python3 - "$ROOT/grok2api/config/config.termux.yaml" "$DEST" "$JWT" "$ENC" "$PW" "$PORT" << 'PY'
import sys
tpl, dest, jwt, enc, pw, port = sys.argv[1:7]
t = open(tpl, encoding="utf-8").read()
t = t.replace("replace-with-at-least-32-characters", jwt)
t = t.replace("replace-with-base64-key", enc)
t = t.replace("replace-with-a-strong-password", pw)
t = t.replace('listen: "127.0.0.1:8000"', 'listen: "127.0.0.1:%s"' % port)
for bad in ("replace-with-at-least-32-characters", "replace-with-base64-key", "replace-with-a-strong-password"):
    if bad in t:
        raise SystemExit("!! 占位符未全部替换: " + bad)
open(dest, "w", encoding="utf-8").write(t)
print("已生成 " + dest + "（端口 " + port + "）")
PY
chmod 600 "$DEST"

cat > "$ADMIN" << EOF
grok2api 管理台: http://127.0.0.1:$PORT
管理员账号: admin
管理员密码: $PW
(首次登录后建议改密；稳定运行后可删掉 config.yaml 的 bootstrapAdmin 段)
EOF
chmod 600 "$ADMIN"
echo "管理员密码已写入 $ADMIN（600 权限，勿外传）"
if [ -f "$VM/data/backend.db" ]; then
  echo "提示：检测到已有数据库（data/backend.db），bootstrapAdmin 只在建库时生效；"
  echo "      现网管理员密码以数据库为准，要强制重置请删掉 data/backend.db 再启动。"
fi
