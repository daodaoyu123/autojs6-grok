#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""grok2api 全模型端到端真跑：逐模型发真实请求，输出 PASS/FAIL 表。

用法: python3 bin/g2a_models_test.py [--skip-video]
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")


def key():
    for line in open(os.path.expanduser("~/grok2api_keys.txt"), encoding="utf-8", errors="replace"):
        m = re.search(r"([A-Za-z0-9_\-]{30,})", line)
        if m:
            return m.group(1)
    raise SystemExit("no key")


K = key()


def api(method, path, body=None, timeout=180):
    h = {"Authorization": "Bearer " + K}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()


def fetch(url, timeout=60):
    if not url.startswith("http"):
        return 0, b""
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + K})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


results = []


def show(m, kind, st, ok, detail):
    results.append((m, kind, st, ok, detail))
    print(("PASS" if ok else "FAIL"), "|", m, "|", kind, "|", st, "|", detail, flush=True)


# ---------- 1. 文本模型 ----------
for m in ["grok-4.5", "grok-4.3", "grok-4.7", "grok-composer-2.5-fast", "grok-chat-fast"]:
    st, b = api("POST", "/v1/chat/completions",
                {"model": m, "messages": [{"role": "user", "content": "只回复两个字母: OK"}], "max_tokens": 16})
    ok, detail = st == 200, ""
    if ok:
        try:
            d = json.loads(b)
            detail = (d["choices"][0]["message"]["content"] or "?")[:24].replace("\n", " ")
        except Exception:
            ok, detail = False, "响应解析失败"
    if not ok and not detail:
        detail = b[:110].decode("utf-8", "replace")
    show(m, "chat", st, ok, detail)

# ---------- 2. 图像模型 ----------
first_img = None
for m in ["grok-imagine-image", "grok-imagine-image-2.0", "grok-imagine-image-lite"]:
    st, b = api("POST", "/v1/images/generations",
                {"model": m, "prompt": "一只戴着墨镜的红色小狐狸，扁平插画风"}, timeout=240)
    ok, detail = st == 200, ""
    if ok:
        try:
            d = json.loads(b)
            url = (d.get("data") or [{}])[0].get("url") or ""
            if url.startswith("http"):
                st2, c2 = fetch(url)
                ok = st2 == 200 and len(c2) > 5000
                detail = "img %s %dKB" % (st2, len(c2) // 1024)
                if first_img is None:
                    first_img = url
            else:
                ok, detail = False, json.dumps(d)[:90]
        except Exception as e:
            ok, detail = False, str(e)[:70]
    if not ok and not detail:
        detail = b[:110].decode("utf-8", "replace")
    show(m, "image", st, ok, detail)

# ---------- 3. 图像编辑（输入图必须是公网 HTTPS——网关会自己下载；本地 127.0.0.1 不允许）----------
PUBLIC_TEST_IMG = "https://raw.githubusercontent.com/github/explore/main/topics/python/python.png"
if first_img:
    st, b = api("POST", "/v1/images/edits",
                {"model": "grok-imagine-image-edit", "prompt": "把背景换成星空", "image": {"url": PUBLIC_TEST_IMG}}, timeout=240)
    ok, detail = st == 200, ""
    if ok:
        try:
            d = json.loads(b)
            url = (d.get("data") or [{}])[0].get("url") or ""
            st2, c2 = fetch(url)
            ok = st2 == 200 and len(c2) > 5000
            detail = "edit-img %s %dKB" % (st2, len(c2) // 1024)
        except Exception as e:
            ok, detail = False, str(e)[:70]
    if not ok and not detail:
        detail = b[:110].decode("utf-8", "replace")
    show("grok-imagine-image-edit", "image-edit", st, ok, detail)
else:
    show("grok-imagine-image-edit", "image-edit", -1, False, "无可用输入图（前置失败）")

# ---------- 4. 视频模型 ----------
if "--skip-video" not in sys.argv:
    st, b = api("POST", "/v1/videos/generations",
                {"model": "Web/grok-imagine-video", "prompt": "一只小狐狸在雪地奔跑，运镜跟随",
                 "duration": 6, "resolution": "720p", "aspect_ratio": "16:9"}, timeout=120)
    ok, detail = False, ""
    if st in (200, 202):
        try:
            d = json.loads(b)
            rid = d.get("requestId") or d.get("request_id") or (d.get("data") or {}).get("requestId") or d.get("id") or ""
            detail = "requestId=" + str(rid)[:18]
            if rid:
                t0 = time.time()
                while time.time() - t0 < 600:
                    time.sleep(10)
                    st3, b3 = api("GET", "/v1/videos/" + str(rid))
                    if st3 != 200:
                        continue
                    d3 = json.loads(b3)
                    stt = str(d3.get("status") or d3.get("state") or "").lower()
                    if stt in ("completed", "succeeded", "done", "success"):
                        url = d3.get("url") or (d3.get("output") or {}).get("url") or (d3.get("data") or {}).get("url") or ""
                        st4, c4 = fetch(url)
                        ok = st4 == 200 and len(c4) > 10000
                        detail += " | 完成 %s %dKB" % (st4, len(c4) // 1024)
                        break
                    if stt in ("failed", "error", "canceled"):
                        detail += " | 失败: " + json.dumps(d3)[:90]
                        break
                else:
                    detail += " | 超时(10分钟)"
            else:
                detail += " | 响应: " + json.dumps(d)[:100]
        except Exception as e:
            detail = str(e)[:90]
    else:
        detail = b[:130].decode("utf-8", "replace")
    show("Web/grok-imagine-video", "video", st, ok, detail)

# ---------- 汇总 ----------
print()
print("========== 汇总 ==========")
npass = sum(1 for r in results if r[3])
for r in results:
    print(("PASS" if r[3] else "FAIL"), "|", r[0], "|", r[1], "|", r[2], "|", r[4])
print("通过 %d / %d" % (npass, len(results)))
sys.exit(0 if npass == len(results) else 1)
