#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Outlook 别名验证码服务（供 AutoJs6 注册脚本调用）。

一个 Outlook 邮箱用 + 别名变出无限地址：name+xxxx@outlook.com 的邮件
全部落进同一个收件箱。本服务经 IMAP 取信，提取 x.ai 的验证码。

配置：~/outlook_mail.json（权限 600）
  {"email": "你的名字@outlook.com", "app_password": "xxxx xxxx xxxx xxxx"}
app_password 是微软账号安全设置里生成的「应用密码」，不是登录密码。

接口（127.0.0.1:8798）：
  GET /code?email=name+xxxx@outlook.com  -> {"code": "ABC-123"} 或 {"code": null}
"""
import email
import imaplib
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST, PORT = "127.0.0.1", 8798
CFG = os.path.expanduser("~/outlook_mail.json")
IMAP_HOST = "outlook.office365.com"
CODE_RE = re.compile(r"\b([A-Z0-9]{3}-[A-Z0-9]{3})\b")


def load_cfg():
    with open(CFG, encoding="utf-8") as f:
        c = json.load(f)
    if not c.get("email") or not c.get("app_password"):
        raise SystemExit("配置缺少 email 或 app_password")
    return c


def fetch_code(target):
    """在收件箱里找发给 target 的最新验证码。找不到返回 None。"""
    cfg = load_cfg()
    m = imaplib.IMAP4_SSL(IMAP_HOST, 993)
    try:
        m.login(cfg["email"], cfg["app_password"].replace(" ", ""))
        m.select("INBOX")
        since = imaplib.Time2Internaldate(time.time() - 1800)
        typ, data = m.search(None, "SINCE", since.split(" ")[0])
        ids = data[0].split()[-25:] if data and data[0] else []
        for mid in reversed(ids):
            typ, msgdata = m.fetch(mid, "(RFC822)")
            if typ != "OK" or not msgdata or not msgdata[0]:
                continue
            msg = email.message_from_bytes(msgdata[0][1])
            to = (msg.get("To") or "") + " " + (msg.get("Delivered-To") or "")
            if target.lower() not in to.lower():
                continue
            body = []
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() in ("text/plain", "text/html"):
                        body.append(part.get_payload(decode=True).decode("utf-8", "replace"))
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    body.append(payload.decode("utf-8", "replace"))
            text = (msg.get("Subject") or "") + "\n" + "\n".join(body)
            found = CODE_RE.search(text)
            if found:
                return found.group(1)
        return None
    finally:
        try:
            m.logout()
        except Exception:
            pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        target = (q.get("email") or [""])[0].strip()
        if not target:
            self._send({"error": "缺少 email 参数"}, 400)
            return
        try:
            code = fetch_code(target)
        except imaplib.IMAP4.error as e:
            self._send({"error": "IMAP 登录失败: " + str(e)[:80]}, 500)
            return
        except Exception as e:
            self._send({"error": type(e).__name__ + ": " + str(e)[:80]}, 500)
            return
        print("[%s] %s -> %s" % (time.strftime("%H:%M:%S"), target, "取到" if code else "暂无"), flush=True)
        self._send({"code": code})

    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    load_cfg()
    print("Outlook 验证码服务监听 %s:%d" % (HOST, PORT), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
