#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""WebView 注册一步到位：注册新号 + 抓 Web sso + 抓 OAuth token(Buid 池) + 自动清场。

用法:
  grok_signup_webview.py 1            # 跑 1 轮（试水）
  grok_signup_webview.py 5 --import   # 跑 5 轮，结束后自动导入 grok2api（build+web）

说明:
  - 依赖 grok_oauth.py(:8799)，会自动拉起
  - 全程占用手机前台 WebView；单轮约 2-4 分钟
  - 只打印账号状态与 sso 长度，不打印密码/sso 明文
"""
import glob
import json
import os
import subprocess
import sys
import time

GROK = "/storage/emulated/0/Hermes工作区/grok"
TPL = GROK + "/signup_webview_template.js"
RUN = GROK + "/signup_webview_run.js"
ACCOUNTS = GROK + "/grok_accounts.txt"
SSO = GROK + "/sso_from_autojs.txt"
TOKENDIR = "/storage/emulated/0/Download/QQ/grok api"
RUNNER = GROK + "/autojs_run.py"
OAUTH_UP = "/data/data/com.termux/files/home/bin/grok-oauth-up.sh"
HOME = "/data/data/com.termux/files/home"


def read(p):
    if not os.path.exists(p):
        return ""
    return open(p, encoding="utf-8", errors="replace").read()


def main():
    rounds = 1
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        rounds = int(sys.argv[1])
    do_import = "--import" in sys.argv

    subprocess.run(["bash", OAUTH_UP], capture_output=True)
    ping = subprocess.run(["curl", "-s", "--max-time", "3", "http://127.0.0.1:8799/ping"],
                          capture_output=True, text=True)
    print("oauth 服务:", ping.stdout.strip() or "(无响应)")
    if "ok" not in ping.stdout:
        raise SystemExit("grok_oauth.py 未就绪（看 ~/…/grok/log/grok_oauth.log）")

    before = read(ACCOUNTS)
    before_sso = read(SSO)
    t0 = time.time()

    with open(RUN, "w", encoding="utf-8") as f:
        f.write(read(TPL).replace("__ROUNDS__", str(rounds)))
    print("已生成 %s（%d 轮），下发 AutoJs6 …" % (RUN, rounds))

    timeout = rounds * 300 + 360
    try:
        p = subprocess.run(["python3", "-u", RUNNER, RUN, "--wait", "240"],
                           capture_output=True, text=True, timeout=timeout)
        print((p.stdout or "")[-9000:])
        if p.stderr:
            print("[stderr]", p.stderr[-500:])
    except subprocess.TimeoutExpired as e:
        print("[超时] 下发等待超时；已收到输出尾部:")
        if e.stdout:
            print(str(e.stdout)[-4000:])

    new = read(ACCOUNTS)[len(before):].strip()
    ssotxt = read(SSO)
    newsso = ssotxt[len(before_sso):].strip() if len(ssotxt) > len(before_sso) else ""
    print("== 结果 ==")
    for line in new.splitlines():
        parts = line.split("----")
        print("  账号:", parts[0], "|", (parts[-1][:34] if len(parts) >= 5 else "?"))
    for line in newsso.splitlines():
        e, _, s = line.partition("----")
        print("  sso :", e, "| 长度", len(s))

    if do_import:
        print("== 导入 grok2api ==")
        files = []
        for fp in glob.glob(TOKENDIR + "/xai-*.json"):
            if os.path.getmtime(fp) >= t0 - 5:
                try:
                    files.append(json.load(open(fp, encoding="utf-8")))
                except Exception:
                    pass
        if files:
            imp = os.path.expanduser("~/g2a_import_new.json")
            with open(imp, "w", encoding="utf-8") as f:
                json.dump(files, f, ensure_ascii=False)
            os.chmod(imp, 0o600)
            r = subprocess.run(["python3", HOME + "/bin/g2a_admin.py", "import", imp],
                               capture_output=True, text=True, timeout=600)
            print(((r.stdout or "")[-1500:]))
        else:
            print("(本批没有新 token 文件)")
        r = subprocess.run(["python3", HOME + "/bin/g2a_web_test.py"],
                           capture_output=True, text=True, timeout=600)
        print((r.stdout or "")[-2000:])


if __name__ == "__main__":
    main()
