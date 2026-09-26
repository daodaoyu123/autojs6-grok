#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""8800 转发层自检：自动登录 + cookie 认证 + 透传。不打印任何凭据内容。"""
import http.client
import re

HOST, PORT = "127.0.0.1", 8800
ok = True


def probe(method, path, headers=None):
    c = http.client.HTTPConnection(HOST, PORT, timeout=20)
    c.request(method, path, headers=headers or {})
    r = c.getresponse()
    body = r.read()
    hdrs = r.getheaders()
    c.close()
    return r.status, hdrs, body


# 1) /hermes-autologin → 302 + 两个 Set-Cookie
st, hs, _ = probe("GET", "/hermes-autologin")
cookies = [v for k, v in hs if k.lower() == "set-cookie"]
print("1) /hermes-autologin ->", st, "| Set-Cookie 数:", len(cookies))
ok &= st == 302 and len(cookies) >= 1

# 2) 无 cookie 访问 / → 302 自动登录
st2, _, _ = probe("GET", "/")
print("2) GET /（无cookie）->", st2)
ok &= st2 == 302

# 3) 透传：/healthz → 200
st3, _, b3 = probe("GET", "/healthz")
print("3) /healthz ->", st3, "|", b3[:30])
ok &= st3 == 200

# 4) 带 access cookie 访问管理 API → 200（证明 cookie 认证走通）
access = ""
for v in cookies:
    m = re.match(r"(grok2api_admin_access=[^;]+)", v)
    if m:
        access = m.group(1)
        break
if access:
    st4, _, b4 = probe("GET", "/api/admin/v1/accounts", {"Cookie": access})
    print("4) 带cookie访问 /api/admin/v1/accounts ->", st4, "| 响应", len(b4), "字节")
    ok &= st4 == 200
else:
    print("4) 未拿到 access cookie，跳过")
    ok = False

# 5) 带 cookie 访问 / → 透传 200（已登录用户正常打开）
st5, _, _ = probe("GET", "/", {"Cookie": access or "x=y"})
print("5) GET /（带cookie）->", st5)
ok &= st5 == 200

print("== 自检", "PASS" if ok else "FAIL", "==")
raise SystemExit(0 if ok else 1)
