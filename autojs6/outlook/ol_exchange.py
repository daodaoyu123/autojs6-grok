#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 AutoJs6 捕获的 OAuth 回调兑换成 refresh_token，追加进 outlook 账号池。

输入：
  /storage/emulated/0/Hermes工作区/grok/log/ol_authcode.txt   （worker 拦截的 localhost?code=... 完整 URL）
  /storage/emulated/0/Hermes工作区/grok/log/ol_state.json     （{email, password, ...}）
输出：
  /storage/emulated/0/Hermes工作区/grok/outlook-accounts.txt
    每行：email----password----client_id----refresh_token     （与 grok-register 的 outlook 账号池格式一致）

用法：python3 ~/bin/ol_exchange.py
不打印任何 token 原文，只打印长度/状态。
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

CLIENT_ID = "9e5f94bc-e8a4-4e73-b8be-63364c29d753"
TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
REDIRECT = "https://localhost"
SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"

DIR = "/storage/emulated/0/Hermes工作区/grok"
CODE_FILE = os.path.join(DIR, "log", "ol_authcode.txt")
STATE_FILE = os.path.join(DIR, "log", "ol_state.json")
POOL_FILE = os.path.join(DIR, "outlook-accounts.txt")


def log(m):
    print(m, flush=True)


def read_code():
    if not os.path.exists(CODE_FILE):
        return None
    raw = open(CODE_FILE, encoding="utf-8", errors="replace").read().strip()
    if not raw:
        return None
    m = re.search(r"[?&]code=([^&\s]+)", raw)
    if m:
        return urllib.parse.unquote(m.group(1))
    if re.fullmatch(r"[A-Za-z0-9._~-]{20,}", raw):
        return raw
    return None


def exchange(code):
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT,
        "scope": SCOPE,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def append_pool(email, password, refresh):
    line = f"{email}----{password}----{CLIENT_ID}----{refresh}"
    os.makedirs(os.path.dirname(POOL_FILE), exist_ok=True)
    if os.path.exists(POOL_FILE):
        for ln in open(POOL_FILE, encoding="utf-8"):
            if ln.split("----")[0].strip().lower() == email.lower():
                return "exists"
    with open(POOL_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    try:
        os.chmod(POOL_FILE, 0o600)
    except OSError:
        pass
    return "added"


def main():
    code = read_code()
    if not code:
        log("没有可用授权码")
        return 1
    st = json.load(open(STATE_FILE, encoding="utf-8"))
    email, password = st.get("email"), st.get("password")
    if not email or not password:
        log("state 缺 email/password")
        return 1
    try:
        tok = exchange(code)
    except Exception as e:
        body = getattr(e, "read", lambda: b"")().decode(errors="replace")[:300]
        log(f"兑换失败: {e} {body}")
        return 1
    rt = tok.get("refresh_token")
    if not rt:
        log(f"响应无 refresh_token: keys={list(tok)[:6]}")
        return 1
    log(f"兑换成功: {email} refresh_token 长度 {len(rt)}")
    log("账号池: " + append_pool(email, password, rt))


if __name__ == "__main__":
    sys.exit(main() or 0)
