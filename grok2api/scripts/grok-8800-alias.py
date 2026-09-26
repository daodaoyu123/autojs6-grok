#!/data/data/com.termux/files/usr/bin/python3
"""旧地址兼容层 v2.1：监听 127.0.0.1:8800。

功能：
1. 透明转发 → 127.0.0.1:8000（grok2api）——HTTP/SSE 流式原样穿透。
2. 零输入自动登录（带会话缓存，避免触发登录限速：IP 30/分、用户 12/分）：
   - 首次或强制时登录一次，之后复用缓存的会话 cookie（不再调登录接口）；
   - 遇到 429：有缓存用缓存，无缓存则返回自动重试页（15 秒刷新，窗口一过自动进）；
   - 并发登录用锁串行化，防止浏览器多请求同时触发登录风暴。
   - GET /hermes-autologin  → 强制重新登录（429 且有缓存时退回缓存）
   - GET /（无会话 cookie） → 自动完成（优先用缓存）
   凭据运行时从 ~/grok2api_admin.txt 读取。cookie 绑定域名不绑端口，登录后 8000/8800 都算已登录。
"""
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request

LISTEN = ("127.0.0.1", 8800)
TARGET = ("127.0.0.1", 8000)
UPSTREAM = "http://127.0.0.1:8000"
BUFSIZE = 65536
ADMIN_INFO = os.path.expanduser("~/grok2api_admin.txt")

COOKIE_CACHE = []
CACHE_LOCK = threading.Lock()
LOGIN_LOCK = threading.Lock()

RETRY_PAGE = (
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta http-equiv='refresh' content='15'>"
    "<title>正在等待自动登录…</title></head>"
    "<body style='font-family:sans-serif;padding:2.2em;line-height:1.7'>"
    "<h3>登录接口被限速，正在自动重试…</h3>"
    "<p>登录接口限制为每分钟 12 次/用户，刚才的集中请求用满了额度。</p>"
    "<p>此页每 15 秒自动重试一次，登录成功后自动进入管理台，无需任何操作。</p>"
    "</body></html>"
)


def log(msg):
    try:
        with open(os.path.expanduser("~/.grok/logs/alias8800.log"), "a", encoding="utf-8") as f:
            f.write("[%s] %s\n" % (time.strftime("%m-%d %H:%M:%S"), msg))
    except Exception:
        pass


def admin_creds():
    user, pwd = "admin", ""
    for line in open(ADMIN_INFO, encoding="utf-8"):
        if line.startswith("管理员账号"):
            user = line.split(":", 1)[1].strip()
        elif line.startswith("管理员密码"):
            pwd = line.split(":", 1)[1].strip()
    return user, pwd


def do_login():
    user, pwd = admin_creds()
    body = json.dumps({"username": user, "password": pwd}).encode()
    req = urllib.request.Request(
        UPSTREAM + "/api/admin/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.headers.get_all("Set-Cookie") or []


def pick_cookies(force):
    """返回 (cookies 或 None, note)。优先缓存；需要且允许时才真登录。"""
    with CACHE_LOCK:
        cached = list(COOKIE_CACHE)
    if cached and not force:
        return cached, "cache"
    with LOGIN_LOCK:
        if not force:
            with CACHE_LOCK:
                cached = list(COOKIE_CACHE)
            if cached:
                return cached, "cache-race"
        try:
            fresh = do_login()
            with CACHE_LOCK:
                COOKIE_CACHE[:] = fresh
            log("登录成功，缓存 %d 个 cookie" % len(fresh))
            return fresh, "fresh"
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log("登录被限速(429)")
                with CACHE_LOCK:
                    cached = list(COOKIE_CACHE)
                if cached:
                    return cached, "429-cache"
                return None, "429"
            log("登录失败: HTTP %s" % e.code)
            return None, "err%s" % e.code
        except Exception as e:
            log("登录异常: %s" % e)
            return None, "err"


def send(conn, status_line, headers, body=b""):
    out = [status_line]
    out += headers
    out.append("Content-Length: %d" % len(body))
    out.append("Cache-Control: no-store")
    out.append("Connection: close")
    conn.sendall(("\r\n".join(out) + "\r\n\r\n").encode("latin-1") + body)


def autologin_response(conn, force):
    cookies, note = pick_cookies(force)
    if not cookies:
        if note == "429":
            send(conn, "HTTP/1.1 200 OK", ["Content-Type: text/html; charset=utf-8"],
                 RETRY_PAGE.encode("utf-8"))
        else:
            msg = ("自动登录失败(%s)，稍后重试。" % note).encode("utf-8")
            send(conn, "HTTP/1.1 502 Bad Gateway",
                 ["Content-Type: text/plain; charset=utf-8"], msg)
        return
    hdr = ["Location: http://127.0.0.1:8800/"]
    for c in cookies:
        c2 = re.sub(r";\s*Secure", "", c, flags=re.I)
        hdr.append("Set-Cookie: " + c2)
    send(conn, "HTTP/1.1 302 Found", hdr)


def pump(src, dst):
    try:
        while True:
            data = src.recv(BUFSIZE)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except Exception:
            pass


def handle(c):
    try:
        c.settimeout(30)
        head = b""
        while b"\r\n\r\n" not in head and len(head) < 65536:
            chunk = c.recv(BUFSIZE)
            if not chunk:
                break
            head += chunk
        if not head:
            c.close()
            return
        text = head.split(b"\r\n\r\n", 1)[0].decode("latin-1", "replace")
        lines = text.split("\r\n")
        parts = (lines[0].split() + ["", "", ""])
        method, path = parts[0].upper(), parts[1]
        hdrs = {}
        for ln in lines[1:]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                hdrs[k.strip().lower()] = v.strip()
        want = path.split("?", 1)[0]
        cookie = hdrs.get("cookie", "")
        if method in ("GET", "HEAD") and (
            want == "/hermes-autologin" or (want == "/" and "grok2api_admin_access" not in cookie)
        ):
            autologin_response(c, force=(want == "/hermes-autologin"))
            c.close()
            return
        u = socket.create_connection(TARGET, timeout=10)
        u.sendall(head)
        threading.Thread(target=pump, args=(c, u), daemon=True).start()
        threading.Thread(target=pump, args=(u, c), daemon=True).start()
    except Exception:
        try:
            c.close()
        except Exception:
            pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN)
    srv.listen(64)
    print("8800 转发+自动登录 v2.1 已启动（带会话缓存）", flush=True)
    while True:
        try:
            c, _ = srv.accept()
        except Exception:
            continue
        threading.Thread(target=handle, args=(c,), daemon=True).start()


if __name__ == "__main__":
    main()
