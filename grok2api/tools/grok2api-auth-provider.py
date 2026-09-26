#!/data/data/com.termux/files/usr/bin/python3
# -*- coding: utf-8 -*-
"""grok CLI auth provider v3（迁移后版）——从 grok2api 管理端导出真实 token。

迁移后 CLI 的模型请求全部走本机转换层（~/bin/grok-cli-shim.py → grok2api），
但 `grok login` 会校验 token（伪造 JWT 会被拒并转入交互式 OAuth），
因此这里向 grok2api 管理 API 要一份当前最新、未过期的真实 access_token。

- 读管理员密码 ~/grok2api_admin.txt（600）。
- GET /api/admin/v1/accounts/export?provider=grok_build 导出（含最新 token）。
- 选剩余有效期最长的账号，stdout 输出 {access_token, refresh_token, expires_in}。
- 全过程不打印任何 token 内容（stderr 只记邮箱与剩余秒数）。
"""
import base64
import datetime
import json
import os
import sys
import urllib.request

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")
ADMIN_INFO = os.path.expanduser("~/grok2api_admin.txt")


def log(msg):
    sys.stderr.write("[xai-pool-v3] %s\n" % msg)


def admin_login():
    pw = ""
    for line in open(ADMIN_INFO, encoding="utf-8"):
        if line.startswith("管理员密码"):
            pw = line.split(":", 1)[1].strip()
    data = json.dumps({"username": "admin", "password": pw}).encode()
    req = urllib.request.Request(BASE + "/api/admin/v1/auth/login", data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())["data"]["tokens"]["accessToken"]


def export_accounts(token):
    req = urllib.request.Request(
        BASE + "/api/admin/v1/accounts/export?provider=grok_build",
        headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        doc = json.loads(r.read().decode())
    return doc.get("accounts") or []


def token_expiry(entry):
    raw = entry.get("expires_at")
    if raw:
        try:
            return datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError:
            pass
    at = entry.get("access_token") or ""
    try:
        payload = at.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return datetime.datetime.fromtimestamp(float(claims.get("exp")), datetime.timezone.utc)
    except Exception:
        return None


def main():
    try:
        token = admin_login()
        accounts = export_accounts(token)
    except Exception as e:
        log("grok2api 导出失败: %s" % str(e)[:200])
        return 1
    now = datetime.datetime.now(datetime.timezone.utc)
    best, best_exp = None, now
    for a in accounts:
        if not (a.get("access_token") or ""):
            continue
        exp = token_expiry(a)
        if exp and exp > best_exp:
            best, best_exp = a, exp
    if not best:
        log("导出中没有未过期账号（共 %d 个）" % len(accounts))
        return 1
    ttl = int((best_exp - now).total_seconds())
    log("选用 %s（剩 %d 秒）" % (best.get("email"), ttl))
    sys.stdout.write(json.dumps({
        "access_token": best["access_token"],
        "refresh_token": best.get("refresh_token", ""),
        "expires_in": max(300, ttl),
    }) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
