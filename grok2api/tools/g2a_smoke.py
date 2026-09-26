#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""grok2api 端到端冒烟：模型列表 + 真实对话。"""
import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("G2A_BASE", "http://127.0.0.1:8000")


def key():
    for line in open(os.path.expanduser("~/grok2api_keys.txt"), encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) == 3 and parts[2]:
            return parts[2]
    raise SystemExit("no key")


def call(method, path, keyv, body=None, timeout=240):
    h = {"Authorization": "Bearer " + keyv}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


k = key()
print("== key 前缀 ==", k[:12] + "...")
code, text = call("GET", "/v1/models", k)
print("GET /v1/models:", code)
try:
    models = [m.get("id") for m in json.loads(text).get("data", [])]
except Exception:
    print(text[:400])
    raise SystemExit(1)
print("模型数:", len(models))
for m in models[:20]:
    print("  -", m)

pick = None
for pref in ("grok-4.6", "grok-build", "grok-4"):
    for m in models:
        if pref in m:
            pick = m
            break
    if pick:
        break
if not pick and models:
    pick = models[0]
print("选用模型:", pick)

code, text = call("POST", "/v1/chat/completions", k, {
    "model": pick,
    "messages": [{"role": "user", "content": "只回复四个字母：G2A-OK"}],
    "stream": False,
})
print("POST /v1/chat/completions:", code)
try:
    d = json.loads(text)
    msg = d["choices"][0]["message"]
    print("回复:", (msg.get("content") or "")[:200])
    print("finish_reason:", d["choices"][0].get("finish_reason"), "| usage:", d.get("usage"))
except Exception:
    print(text[:500])
