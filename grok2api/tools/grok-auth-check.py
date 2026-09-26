#!/data/data/com.termux/files/usr/bin/python3
# -*- coding: utf-8 -*-
"""grok auth.json 有效性检查。

退出码：0 = 凭证仍在有效期（留 5 分钟余量）；3 = 缺失/损坏/即将过期（需重新登录）。
用法：grok-auth-check.py <auth.json 路径>
"""
import datetime
import json
import sys

try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    now = datetime.datetime.now(datetime.timezone.utc)
    for v in d.values():
        if isinstance(v, dict) and v.get("expires_at"):
            exp = datetime.datetime.fromisoformat(str(v["expires_at"]).replace("Z", "+00:00"))
            sys.exit(0 if exp > now + datetime.timedelta(minutes=5) else 3)
except Exception:
    pass
sys.exit(3)
