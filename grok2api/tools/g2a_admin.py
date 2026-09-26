#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""grok2api 管理端小助手：登录 / 导入 Build 账号 / 创建客户端 Key。

用法：
  g2a_admin.py login             # 验证登录
  g2a_admin.py import <文件>     # 导入账号（SSE 进度，打印结果摘要）
  g2a_admin.py key <名称>        # 创建客户端 Key（secret 落盘 ~/grok2api_keys.txt）
"""
import json
import os
import sys
import uuid
import urllib.error
import urllib.request

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")
ADMIN_INFO = os.path.expanduser("~/grok2api_admin.txt")
KEYS_FILE = os.path.expanduser("~/grok2api_keys.txt")


def admin_password():
    for line in open(ADMIN_INFO, encoding="utf-8"):
        if line.startswith("管理员密码"):
            return line.split(":", 1)[1].strip()
    raise SystemExit("找不到管理员密码（%s）" % ADMIN_INFO)


def api(path, token=None, method="GET", body=None, headers=None, timeout=90):
    h = dict(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        if isinstance(body, (dict, list)):
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
        else:
            data = body
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
        raise SystemExit("登录失败: %s %s" % (code, text[:300]))
    return json.loads(text)["data"]["tokens"]["accessToken"]


def do_import(path):
    token = login()
    boundary = "----g2a" + uuid.uuid4().hex
    content = open(path, "rb").read()
    name = os.path.basename(path)
    body = b"".join([
        ("--%s\r\n" % boundary).encode(),
        ('Content-Disposition: form-data; name="files"; filename="%s"\r\n' % name).encode(),
        b"Content-Type: application/json\r\n\r\n",
        content,
        ("\r\n--%s--\r\n" % boundary).encode(),
    ])
    code, text = api("/api/admin/v1/accounts/import", token=token, method="POST", body=body,
                     headers={"Content-Type": "multipart/form-data; boundary=" + boundary,
                              "Accept": "text/event-stream"}, timeout=600)
    print("HTTP", code)
    for line in text.splitlines():
        if line.startswith("data:"):
            print("  ", line[:400])


def make_key(name):
    token = login()
    code, text = api("/api/admin/v1/client-keys", token=token, method="POST", body={"name": name})
    print("HTTP", code)
    if code == 201:
        data = json.loads(text)["data"]
        secret = data.get("secret", "")
        with open(KEYS_FILE, "a", encoding="utf-8") as f:
            f.write("%s\t%s\t%s\n" % (name, data.get("key", {}).get("prefix", ""), secret))
        os.chmod(KEYS_FILE, 0o600)
        print("已创建，secret 已写入", KEYS_FILE)
        print("prefix:", data.get("key", {}).get("prefix", ""))
    else:
        print(text[:500])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "login"
    if cmd == "login":
        t = login()
        print("登录 OK，token 长度", len(t))
    elif cmd == "import":
        do_import(sys.argv[2])
    elif cmd == "key":
        make_key(sys.argv[2] if len(sys.argv) > 2 else "default")
    else:
        raise SystemExit(__doc__)
