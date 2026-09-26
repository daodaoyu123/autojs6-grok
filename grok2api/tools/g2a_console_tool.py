#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Console 池维护小工具：额度刷新 / 查账号状态。
用法: g2a_console_tool.py refresh | g2a_console_tool.py peek
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")
ADMIN_INFO = os.path.expanduser("~/grok2api_admin.txt")


def admin_password():
    for line in open(ADMIN_INFO, encoding="utf-8"):
        if line.startswith("管理员密码"):
            return line.split(":", 1)[1].strip()
    raise SystemExit("找不到管理员密码")


def api(path, token=None, method="GET", body=None, timeout=900):
    h = {}
    if token:
        h["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def login():
    code, text = api("/api/admin/v1/auth/login", method="POST",
                     body={"username": "admin", "password": admin_password()})
    if code != 200:
        raise SystemExit("登录失败: %s %s" % (code, text[:200]))
    return json.loads(text)["data"]["tokens"]["accessToken"]


def peek(token):
    code, text = api("/api/admin/v1/accounts?provider=grok_console&page=1&pageSize=2", token=token)
    print("HTTP", code)
    try:
        d = json.loads(text)["data"]
        items = d.get("items") or d.get("accounts") or []
        for it in items[:2]:
            keep = {k: it.get(k) for k in ("id", "name", "email", "status", "tier", "plan", "quota", "quotas", "billing", "credits", "capabilities", "risk", "cooldown", "agreement") if k in it}
            print(json.dumps(keep, ensure_ascii=False)[:600])
        if not items:
            print("原始:", text[:300])
    except Exception as e:
        print("解析失败:", e, text[:300])


def refresh(token):
    code, text = api("/api/admin/v1/accounts/console/refresh-quotas", token=token, method="POST", body={})
    print("HTTP", code)
    events = [l for l in text.splitlines() if l.startswith("data:")]
    print("事件数:", len(events))
    for l in events[:3] + events[-6:]:
        print("  ", l[:260])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "peek"
    t = login()
    if cmd == "peek":
        peek(t)
    elif cmd == "refresh":
        refresh(t)
    else:
        raise SystemExit(__doc__)
