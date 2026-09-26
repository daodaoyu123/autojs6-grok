#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""grok CLI → grok2api 转换层（本机 127.0.0.1:8802）。

背景：grok CLI 对自定义 base_url 坚持发送"会话 token"，而 grok2api 只认
客户端 key（g2a_...）。本转换层只监听本机，把 CLI 的请求原样转发给
grok2api（127.0.0.1:8000），并换成专用客户端 key。

- 只绑定 127.0.0.1；不接受外部来源。
- 请求体与 SSE 流原样透传（含工具调用）。
- 凭证不落日志（只记方法/路径/状态/字节数）。
"""
import http.server
import os
import time
import urllib.error
import urllib.request

LISTEN = ("127.0.0.1", 8802)
UPSTREAM = "http://127.0.0.1:8000"
KEYS_FILE = os.path.expanduser("~/grok2api_keys.txt")
LOG = os.path.expanduser("~/.grok/logs/shim.log")


def shim_key():
    """读专用 key（名称 grok-cli）；读不到则退回最后一个可用 key。"""
    try:
        rows = []
        for line in open(KEYS_FILE, encoding="utf-8"):
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 3 and parts[2]:
                rows.append((parts[0], parts[2]))
        for name, secret in rows:
            if name == "grok-cli":
                return secret
        if rows:
            return rows[-1][1]
    except Exception:
        pass
    return ""


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f:
            f.write("%s %s\n" % (time.strftime("%F %T"), msg))
    except Exception:
        pass


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self):
        path = self.path
        if path.rstrip("/") == "/healthz":
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        key = shim_key()
        headers = {"Authorization": "Bearer " + key}
        ct = self.headers.get("Content-Type")
        if ct:
            headers["Content-Type"] = ct
        req = urllib.request.Request(UPSTREAM + path, data=payload, headers=headers, method=self.command)
        try:
            resp = urllib.request.urlopen(req, timeout=600)
            code = resp.status
        except urllib.error.HTTPError as e:
            resp = e
            code = e.code
        except Exception as e:
            log("upstream 连接失败: %s" % str(e)[:120])
            body = '{"error":{"message":"shim upstream 不可用"}}'.encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(code)
        self.send_header("Content-Type", resp.headers.get("Content-Type") or "application/json")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        total = 0
        try:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                total += len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        log("%s %s -> %s (%d bytes)" % (self.command, path.split("?")[0], code, total))

    do_GET = do_POST = do_PUT = do_DELETE = _forward

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    server = http.server.ThreadingHTTPServer(LISTEN, Handler)
    log("shim 启动于 %s:%d → %s" % (LISTEN[0], LISTEN[1], UPSTREAM))
    server.serve_forever()
