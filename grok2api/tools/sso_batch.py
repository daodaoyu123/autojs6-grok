#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量抓取 Web SSO（AutoJs6 WebView 路线，串行）。

用法:
  sso_batch.py         # 处理所有「未抓过 sso」的 OK 账号
  sso_batch.py 5       # 只处理前 5 个（试水）

说明:
  - 跳过 sso_from_autojs.txt 里已有 sso 的账号
  - 每号调 ~/bin/autojs_sso.py；单号约 80 秒，全程占用手机前台
  - 只打印成功/失败与 sso 长度，不打印 sso 明文
"""
import os
import subprocess
import sys
import time

ACCOUNTS = "/storage/emulated/0/Hermes工作区/grok/grok_accounts.txt"
OUT = "/storage/emulated/0/Hermes工作区/grok/sso_from_autojs.txt"
RUNNER = "/data/data/com.termux/files/home/bin/autojs_sso.py"


def accounts():
    out = []
    for line in open(ACCOUNTS, encoding="utf-8", errors="replace"):
        p = line.strip().split("----")
        if len(p) >= 5 and p[0].strip() and p[4].startswith("OK"):
            out.append(p[0].strip())
    return out


def done_set():
    s = set()
    if os.path.exists(OUT):
        for line in open(OUT, encoding="utf-8", errors="replace"):
            if "----" in line:
                s.add(line.split("----")[0].strip())
    return s


def main():
    n = sys.argv[1] if len(sys.argv) > 1 else "all"
    todo = [a for a in accounts() if a not in done_set()]
    if n != "all":
        try:
            todo = todo[: int(n)]
        except ValueError:
            raise SystemExit("参数应为数量或省略")
    print("待处理 %d 个账号（已有 sso 的已跳过）" % len(todo))
    ok = fail = 0
    for i, e in enumerate(todo, 1):
        print("--- [%d/%d] %s ---" % (i, len(todo), e), flush=True)
        try:
            r = subprocess.run(["python3", RUNNER, e],
                               capture_output=True, text=True, timeout=360)
            if "sso 已写入" in (r.stdout or ""):
                ok += 1
                print("   ✓ 成功")
            else:
                fail += 1
                print("   ✗ 失败；输出尾部:")
                print("   " + "\n   ".join((r.stdout or "").strip().splitlines()[-6:]))
        except subprocess.TimeoutExpired:
            fail += 1
            print("   ✗ 超时")
        time.sleep(2)
    print("完成: 成功 %d, 失败 %d" % (ok, fail))


if __name__ == "__main__":
    main()
