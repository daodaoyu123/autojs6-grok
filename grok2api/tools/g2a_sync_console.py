#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web → Console 同步：用 Web 账号的同一份 SSO 创建 Grok Console 账号。

用法：
  g2a_sync_console.py count      # 查看 build/web/console 池数量
  g2a_sync_console.py missing    # 只同步还没有 Console 的（推荐）
  g2a_sync_console.py all        # 全部重新同步一遍
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
    raise SystemExit("找不到管理员密码（%s）" % ADMIN_INFO)


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


def counts(token):
    for prov in ("grok_build", "grok_web", "grok_console"):
        code, text = api("/api/admin/v1/accounts?provider=%s&page=1&pageSize=1" % prov, token=token)
        total = "?"
        try:
            d = json.loads(text)["data"]
            for k in ("total", "count"):
                if isinstance(d.get(k), int):
                    total = d[k]
                    break
            else:
                pg = d.get("pagination") or {}
                if isinstance(pg.get("total"), int):
                    total = pg["total"]
                elif isinstance(d.get("items"), list):
                    total = len(d["items"])
        except Exception:
            pass
        if total == "?":
            print("  %-8s (raw) %s" % (prov, text[:140]))
        else:
            print("  %-8s %s" % (prov, total))


def sync(strategy):
    token = login()
    print("== 同步前 ==")
    counts(token)
    print("== 开始同步（策略 %s，SSE 流式）==" % strategy)
    code, text = api("/api/admin/v1/accounts/web/sync-to-console", token=token, method="POST",
                     body={"all": True, "strategy": strategy})
    print("HTTP", code)
    events = [l for l in text.splitlines() if l.startswith("data:")]
    print("事件数:", len(events))
    for l in events[-8:]:
        print("  ", l[:300])
    print("== 同步后 ==")
    counts(token)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "count"
    if cmd == "count":
        counts(login())
    elif cmd in ("missing", "all"):
        sync(cmd)
    else:
        raise SystemExit(__doc__)
