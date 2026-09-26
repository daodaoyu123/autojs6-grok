#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Web SSO 接力测试：导入 sso 到 grok2api Web 池 → 跑预处理脚本 → 试图像生成。

用法: g2a_web_test.py [sso_from_autojs.txt 路径]
sso 只报长度不打印明文。
"""
import base64
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

_ADMIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "g2a_admin.py")
if not os.path.exists(_ADMIN):
    _ADMIN = os.path.expanduser("~/bin/g2a_admin.py")
spec = importlib.util.spec_from_file_location("g2a_admin", _ADMIN)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")
SRC = sys.argv[1] if len(sys.argv) > 1 else \
    "/storage/emulated/0/Hermes工作区/grok/sso_from_autojs.txt"
WS = "/storage/emulated/0/Hermes工作区"
KEYS = os.path.expanduser("~/grok2api_keys.txt")


def read_pairs():
    pairs = []
    for line in open(SRC, encoding="utf-8", errors="replace"):
        if "----" in line:
            e, _, s = line.strip().partition("----")
            if s:
                pairs.append({"email": e.strip(), "sso_token": s.strip()})
    return pairs


def health():
    try:
        with urllib.request.urlopen(BASE + "/healthz", timeout=10) as r:
            print("healthz:", r.status, r.read().decode()[:80])
    except Exception as e:
        print("healthz 失败:", e)
        raise SystemExit("grok2api 未在运行?")


def import_web(pairs):
    token = g.login()
    tmp = os.path.expanduser("~/g2a_web_import.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"accounts": pairs}, f, ensure_ascii=False)
    boundary = "----g2a" + uuid.uuid4().hex
    content = open(tmp, "rb").read()
    body = b"".join([
        ("--%s\r\n" % boundary).encode(),
        ('Content-Disposition: form-data; name="files"; filename="web.json"\r\n').encode(),
        b"Content-Type: application/json\r\n\r\n",
        content,
        ("\r\n--%s--\r\n" % boundary).encode(),
    ])
    code, text = g.api("/api/admin/v1/accounts/web/import", token=token, method="POST", body=body,
                       headers={"Content-Type": "multipart/form-data; boundary=" + boundary,
                                "Accept": "text/event-stream"}, timeout=300)
    print("Web 导入 HTTP", code)
    for line in text.splitlines():
        if line.startswith("data:"):
            print("  ", line[:300])


def list_web():
    token = g.login()
    code, text = g.api("/api/admin/v1/accounts?provider=grok_web&page=1&pageSize=50", token=token)
    if code != 200:
        print("列表失败", code, text[:200])
        return []
    return json.loads(text)["data"]["items"]


def run_scripts(ids):
    token = g.login()
    body = {"ids": ids, "actions": {"acceptTerms": True, "setBirthDate": True, "enableNSFW": True}}
    code, text = g.api("/api/admin/v1/accounts/web/run-scripts", token=token, method="POST", body=body,
                       headers={"Accept": "text/event-stream"}, timeout=300)
    print("run-scripts HTTP", code)
    for line in text.splitlines():
        if line.startswith("data:"):
            print("  ", line[:300])


def client_key():
    for line in open(KEYS, encoding="utf-8"):
        parts = line.strip().split("\t")
        if len(parts) >= 3:
            return parts[-1]
    return ""


def models():
    key = client_key()
    req = urllib.request.Request(BASE + "/v1/models",
                                 headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
    return [m.get("id") for m in d.get("data", [])]


def image_test():
    key = client_key()
    body = json.dumps({"model": "grok-imagine-image",
                       "prompt": "一只红色小狐狸坐在雪地里，卡通插画风格"}).encode()
    req = urllib.request.Request(BASE + "/v1/images/generations", data=body,
                                 headers={"Authorization": "Bearer " + key,
                                          "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("图像生成 HTTP", e.code, e.read().decode()[:500])
        return False
    item = (d.get("data") or [{}])[0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
        path = WS + "/g2a_imagine_test.png"
        with open(path, "wb") as f:
            f.write(raw)
        print("图像已保存(b64):", path, len(raw), "字节")
        return True
    if item.get("url"):
        print("图像 URL:", item["url"][:220])
        try:
            req2 = urllib.request.Request(item["url"], headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2, timeout=60) as r2:
                raw = r2.read()
            path = WS + "/g2a_imagine_test.png"
            with open(path, "wb") as f:
                f.write(raw)
            print("图像已下载:", path, len(raw), "字节")
            return True
        except Exception as e:
            print("图像下载失败:", e)
            return False
    print("返回结构:", json.dumps(d, ensure_ascii=False)[:400])
    return False


def main():
    health()
    pairs = read_pairs()
    if not pairs:
        raise SystemExit("没有可导入的 sso（%s 为空?）" % SRC)
    print("待导入:", [(p["email"], len(p["sso_token"])) for p in pairs])
    import_web(pairs)
    items = list_web()
    print("Web 账号:")
    for it in items:
        print("  id=%s email=%s status=%s tier=%s" % (
            it.get("id"), it.get("email") or it.get("name"), it.get("status"),
            (it.get("web") or {}).get("tier") if isinstance(it.get("web"), dict) else "?"))
    ids = [str(it["id"]) for it in items]
    if ids:
        run_scripts(ids)
    print("模型列表:", models())
    ok = image_test()
    print("图像测试:", "成功 ✓" if ok else "失败 ✗")


if __name__ == "__main__":
    main()
