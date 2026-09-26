#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Termux 侧验证 outlook 号池：逐条用 refresh_token 换 access_token。
轮换后的新 refresh_token 自动写回池文件。不打印任何 token 原文。
用法：python3 ~/bin/ol_verify.py [池文件路径]
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
POOL = sys.argv[1] if len(sys.argv) > 1 else "/storage/emulated/0/Hermes工作区/grok/outlook-accounts.txt"


def refresh(client, rt):
    data = urllib.parse.urlencode({
        "client_id": client, "grant_type": "refresh_token",
        "refresh_token": rt, "scope": SCOPE,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode()), None
    except urllib.error.HTTPError as e:
        return None, e.read().decode(errors="replace")[:150]
    except Exception as e:  # noqa: BLE001
        return None, str(e)


def main():
    lines = [l.rstrip("\n") for l in open(POOL, encoding="utf-8") if l.strip()]
    changed = False
    out = []
    for i, line in enumerate(lines):
        f = line.split("----")
        if len(f) < 4:
            out.append(line)
            continue
        email, pw, client, rt = f[0], f[1], f[2], f[3]
        tok, err = refresh(client, rt)
        if tok and tok.get("access_token"):
            new_rt = tok.get("refresh_token") or rt
            if new_rt != rt:
                line = f"{email}----{pw}----{client}----{new_rt}"
                changed = True
            print(f"第{i+1}行 {email}: 刷新 OK  at_len={len(tok['access_token'])}  rt_len={len(new_rt)}")
        else:
            print(f"第{i+1}行 {email}: 刷新失败  {err}")
        out.append(line)
    if changed:
        with open(POOL, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out) + "\n")
        print("已把轮换后的 refresh_token 写回池文件")
    print(f"共 {len(lines)} 条")


if __name__ == "__main__":
    main()
