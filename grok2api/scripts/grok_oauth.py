#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
注册后自动取 token（xAI 设备码流程 device_code，与官方 grok CLI 同一路径）

流程：
  1. POST https://auth.x.ai/oauth2/device/code  → device_code + 用户码 + 授权地址
  2. 手机浏览器打开 verification_uri_complete（注册后是登录态）→ 确认授权
  3. 后台轮询 POST https://auth.x.ai/oauth2/token（grant_type=device_code）→ 拿到 access/refresh token

接口（供手机端 AutoJs6 脚本调用）：
  GET /new?email=xxx    → {state, url, user_code}   生成一次授权请求并开始轮询
  GET /status?state=xx  → {done, ok, msg, token_file}
  GET /last             → 最近一次结果
  GET /ping             → 存活检查

拿到 token 后写两份：
  1) /storage/emulated/0/Download/QQ/grok api/xai-<email>.json （与现有 12 个号同格式）
  2) ~/.grok/xai_pool.json 追加/更新账号条目（grok CLI 直接用）

运行：python3 grok_oauth.py    （常驻；grok_register.sh 会自动拉起）
"""
import json
import os
import secrets
import sys
import threading
import time
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CLIENT_ID = os.environ.get("XAI_CLIENT_ID", "b1a00492-073a-47ea-816f-4c329264a828")
SCOPE = os.environ.get("XAI_SCOPE",
                       "openid profile email offline_access grok-cli:access api:access")
DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code"
TOKEN_ENDPOINT = "https://auth.x.ai/oauth2/token"
DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
BASE_URL = "https://cli-chat-proxy.grok.com/v1"
TOKEN_DIR = "/storage/emulated/0/Download/QQ/grok api"
POOL_JSON = os.path.expanduser("~/.grok/xai_pool.json")
CTRL_PORT = int(os.environ.get("OAUTH_CTRL_PORT", "8799"))

_sessions = {}          # state -> dict
_lock = threading.Lock()
_last = {"state": None}


def http_post_form(url, data, timeout=40, ua="grok-cli/1.0"):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded",
                                          "Accept": "application/json", "User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:
        return 0, {"error": str(e)}


def jwt_payload(token: str) -> dict:
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(urllib.parse.unquote(
            __import__("base64").urlsafe_b64decode(part).decode("utf-8", "replace")))
    except Exception:
        return {}


def save_token(email: str, tok: dict) -> str:
    now = datetime.now(timezone.utc)
    access = tok.get("access_token", "")
    idt = tok.get("id_token", "")
    payload = jwt_payload(idt) or jwt_payload(access)
    sub = payload.get("sub", "")
    expires_in = int(tok.get("expires_in", 21600) or 21600)

    record = {
        "type": "xai",
        "access_token": access,
        "refresh_token": tok.get("refresh_token", ""),
        "token_type": tok.get("token_type", "Bearer"),
        "expires_in": expires_in,
        "expired": (now + timedelta(seconds=expires_in)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "last_refresh": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "email": email,
        "sub": sub,
        "base_url": BASE_URL,
        "redirect_uri": "device_code",
        "token_endpoint": TOKEN_ENDPOINT,
        "auth_kind": "oauth",
        "id_token": idt,
        "scope": tok.get("scope", SCOPE),
    }
    os.makedirs(TOKEN_DIR, exist_ok=True)
    fname = f"xai-{email}.json"
    fpath = os.path.join(TOKEN_DIR, fname)
    tmp = fpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=1)
    os.replace(tmp, fpath)

    try:
        try:
            with open(POOL_JSON, encoding="utf-8") as f:
                pool = json.load(f)
        except Exception:
            pool = {"created": now.isoformat(), "accounts": [], "cursor": 0, "last_account": None}
        accounts = pool.setdefault("accounts", [])
        entry = {
            "email": email, "sub": sub, "client_id": CLIENT_ID,
            "refresh_token": record["refresh_token"], "base_url": BASE_URL,
            "token_endpoint": TOKEN_ENDPOINT, "redirect_uri": "device_code",
            "src": fname, "file": fpath, "last_used": None, "ok_count": 0,
        }
        for i, a in enumerate(accounts):
            if a.get("email") == email:
                accounts[i] = {**a, **entry}
                break
        else:
            accounts.append(entry)
        tmp2 = POOL_JSON + ".tmp"
        with open(tmp2, "w", encoding="utf-8") as f:
            json.dump(pool, f, ensure_ascii=False, indent=1)
        os.replace(tmp2, POOL_JSON)
    except Exception as e:
        print(f"[warn] 池更新失败: {e}", file=sys.stderr)
    return fpath


def auto_import(email):
    """凭证保存后自动导入 grok2api 号池。失败只记录，不影响注册。"""
    try:
        r = subprocess.run(
            ["python3", os.path.expanduser("~/bin/g2a_import_new.py"), email],
            capture_output=True, text=True, timeout=120,
        )
        tail = (r.stdout or "").strip().splitlines()
        print(f"[g2a] {email} 自动入池: {tail[-1][:160] if tail else '无输出'}")
    except Exception as e:
        print(f"[g2a] {email} 自动入池失败: {e}", file=sys.stderr)


def poll_worker(state: str):
    """后台轮询：等用户在浏览器确认授权 → 换 token"""
    sess = _sessions[state]
    device_code = sess["device_code"]
    interval = max(3, int(sess.get("interval", 5)))
    deadline = time.time() + int(sess.get("expires_in", 1800))
    while time.time() < deadline:
        time.sleep(interval)
        with _lock:
            if _sessions[state].get("done"):
                return
        status, tok = http_post_form(TOKEN_ENDPOINT, {
            "grant_type": DEVICE_GRANT,
            "device_code": device_code,
            "client_id": CLIENT_ID,
        })
        err = (tok or {}).get("error", "")
        if status == 200 and tok.get("access_token"):
            try:
                path = save_token(sess["email"], tok)
                auto_import(sess["email"])
                with _lock:
                    _sessions[state].update(done=True, ok=True, msg="token 已保存", token_file=path)
                print(f"[oauth] ✓ {sess['email']} → {path}")
            except Exception as e:
                with _lock:
                    _sessions[state].update(done=True, ok=False, msg=f"保存失败: {e}")
            return
        if err == "authorization_pending":
            continue
        if err == "slow_down":
            interval += 3
            continue
        if err in ("access_denied", "expired_token", "invalid_grant"):
            with _lock:
                _sessions[state].update(done=True, ok=False, msg=f"授权失败: {err}")
            print(f"[oauth] ✗ {sess['email']}: {err}", file=sys.stderr)
            return
        # 其它错误：记录但继续轮询几次
        print(f"[oauth] 轮询异常 HTTP {status}: {str(tok)[:150]}", file=sys.stderr)
    with _lock:
        _sessions[state].update(done=True, ok=False, msg="超时未授权")


class CtrlHandler(BaseHTTPRequestHandler):
    server_version = "grok-oauth/2.0"

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(u.query)

        if u.path == "/new":
            email = (params.get("email") or [""])[0] or "unknown@niceground.shop"
            status, dev = http_post_form(DEVICE_CODE_URL, {"client_id": CLIENT_ID, "scope": SCOPE})
            if status != 200 or not dev.get("device_code"):
                print(f"[ctrl] device/code 失败 HTTP {status}: {str(dev)[:200]}", file=sys.stderr)
                return self._json({"error": f"device/code 失败 HTTP {status}", "detail": str(dev)[:200]}, 502)
            state = secrets.token_urlsafe(12)
            with _lock:
                _sessions[state] = {
                    "email": email, "device_code": dev["device_code"],
                    "user_code": dev.get("user_code", ""), "interval": dev.get("interval", 5),
                    "expires_in": dev.get("expires_in", 1800),
                    "done": False, "ok": False, "msg": "等待授权", "token_file": "",
                    "created": time.time(),
                }
                _last["state"] = state
            threading.Thread(target=poll_worker, args=(state,), daemon=True).start()
            print(f"[ctrl] 新授权请求 {email} 用户码={dev.get('user_code')}")
            return self._json({
                "state": state,
                "url": dev.get("verification_uri_complete") or dev.get("verification_uri", ""),
                "user_code": dev.get("user_code", ""),
                "expires_in": dev.get("expires_in", 1800),
            })

        if u.path == "/status":
            state = (params.get("state") or [""])[0]
            with _lock:
                s = _sessions.get(state)
            if not s:
                return self._json({"error": "unknown state"}, 404)
            return self._json({k: s[k] for k in ("done", "ok", "msg", "email", "token_file", "user_code")})

        if u.path == "/last":
            with _lock:
                state = _last["state"]
                s = _sessions.get(state) if state else None
            if not s:
                return self._json({"error": "no session yet"}, 404)
            return self._json({**{k: s[k] for k in ("done", "ok", "msg", "email", "token_file", "user_code")},
                               "state": state})

        if u.path == "/ping":
            with _lock:
                done = sum(1 for s in _sessions.values() if s.get("done") and s.get("ok"))
            return self._json({"ok": True, "sessions": len(_sessions), "tokens_saved": done})

        return self._json({"error": "not found"}, 404)


def main():
    ctrl = ThreadingHTTPServer(("127.0.0.1", CTRL_PORT), CtrlHandler)
    print(f"OAuth(设备码流程) 服务已启动: http://127.0.0.1:{CTRL_PORT}")
    try:
        ctrl.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
