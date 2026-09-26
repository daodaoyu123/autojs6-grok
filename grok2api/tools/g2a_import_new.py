#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把最近的 xai-*.json 批量导入 grok2api（Build 池）。

用法:
  g2a_import_new.py --since 20      # 导入最近 20 分钟修改过的 token 文件
  g2a_import_new.py 邮箱1 邮箱2     # 按邮箱导入指定账号
"""
import glob
import importlib.util
import json
import os
import subprocess
import sys
import time

TOKENDIR = "/storage/emulated/0/Download/QQ/grok api"
G2A_ADMIN = "/data/data/com.termux/files/home/bin/g2a_admin.py"


def collect():
    args = sys.argv[1:]
    picks = []
    if "--since" in args:
        mins = int(args[args.index("--since") + 1])
        cut = time.time() - mins * 60
        for fp in glob.glob(TOKENDIR + "/xai-*.json"):
            if os.path.getmtime(fp) >= cut:
                picks.append(fp)
    elif args:
        for email in args:
            fp = os.path.join(TOKENDIR, "xai-%s.json" % email)
            if os.path.exists(fp):
                picks.append(fp)
    else:
        print("用法: g2a_import_new.py --since <分钟>  或  g2a_import_new.py <邮箱...>")
        raise SystemExit(1)
    return picks


def main():
    picks = collect()
    if not picks:
        print("没有匹配的 token 文件")
        return
    recs = []
    names = []
    for fp in picks:
        try:
            recs.append(json.load(open(fp, encoding="utf-8")))
            names.append(os.path.basename(fp))
        except Exception as e:
            print("跳过", fp, e)
    imp = os.path.expanduser("~/g2a_import_new.json")
    with open(imp, "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False)
    os.chmod(imp, 0o600)
    print("待导入 %d 个:" % len(recs), ", ".join(n.replace("xai-", "").replace(".json", "") for n in names))
    r = subprocess.run(["python3", G2A_ADMIN, "import", imp], capture_output=True, text=True, timeout=600)
    out = (r.stdout or "")
    for line in out.splitlines()[-6:]:
        print("  " + line[:220])


if __name__ == "__main__":
    main()
