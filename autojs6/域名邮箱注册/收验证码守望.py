#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""收验证码守望：挂住 QQ 垃圾箱，来信立刻取码并删除。

流程：等待接收验证码 → 挂住垃圾箱 → 提取验证码 → 提取成功 → 写入验证码 → 删除该邮件 → 循环。
只有整轮 180 秒都取不到，才显示「超时未收到」。

要点：
- 只看 Junk：验证码只进垃圾箱，不看 INBOX。
- 登录后重新读能力，QQ 这时才广告 IDLE。
- 有目标时两边一起用：先挂 1 秒等 EXISTS；没推送就重开垃圾箱，扫最新 10 封。
  QQ 经常不推送，所以不能空挂几秒再查。
- 没目标时挂 5 秒，用来看 otp_want.txt 有没有换。
- 来信只认收件人是当前邮箱的标题，取出 NNN-NNN。
- 取到后立刻写 log/grok_otp_<runid>.txt，再 UID 删除该邮件。
- otp_want.txt 一换目标，立刻放弃旧邮箱。
"""
import email
import imaplib
import os
import re
import time
from email.header import decode_header

REG = os.environ.get("OTP_REG_DIR", "/storage/emulated/0/Auto js6/域名邮箱注册")
WANT = REG + "/log/otp_want.txt"
SECRET = os.environ.get("OTP_QQ_SECRET", os.path.expanduser("~/.config/himalaya/qq.secret"))


def _qq_user():
    v = os.environ.get("OTP_QQ_USER", "").strip()
    if v:
        return v
    try:
        return open(os.path.expanduser("~/.config/himalaya/qq.user"),
                    encoding="utf-8").read().strip()
    except OSError:
        raise SystemExit("请设置 OTP_QQ_USER 环境变量，或在 ~/.config/himalaya/qq.user 写入 QQ 邮箱")


USER = _qq_user()
SCAN = 10
PUSH_WAIT = 1
IDLE_WAIT = 5


def header_text(value):
    out = ""
    for text, charset in decode_header(value or ""):
        out += text.decode(charset or "utf-8", errors="replace") if isinstance(text, bytes) else text
    return out


def connect():
    password = open(SECRET, encoding="utf-8").read().strip()
    client = imaplib.IMAP4_SSL("imap.qq.com", 993, timeout=30)
    client.login(USER, password)
    # QQ 在登录之后才把 IDLE 放进能力列表
    client.capability()
    return client


def supports_idle(client):
    return b"IDLE" in client.capabilities or "IDLE" in client.capabilities


def open_junk(client):
    """关掉再打开垃圾箱（刷新），返回邮件总数；失败返回 None。"""
    try:
        client.close()
    except imaplib.IMAP4.error:
        pass
    try:
        typ, data = client.select("Junk")
    except imaplib.IMAP4.error:
        return None
    if typ != "OK":
        return None
    try:
        return int(data[0])
    except (TypeError, ValueError, IndexError):
        return 0


def ensure_junk(client):
    """垃圾箱没打开就打开，已打开就不动。返回是否可用。"""
    if client.state == "SELECTED":
        return True
    return open_junk(client) is not None


def code_from_header(raw, target):
    parsed = email.message_from_bytes(raw)
    blob = (header_text(parsed.get("To")) + " " + header_text(parsed.get("Delivered-To"))).lower()
    if target.lower() not in blob:
        return None
    match = re.search(r"(\d{3}-\d{3})", header_text(parsed.get("Subject")))
    return match.group(1) if match else None


def find_code(client, target):
    """重开垃圾箱，扫最新几封。返回 (码, UID)。推送失败时的退路。"""
    total = open_junk(client)
    if not total or total <= 0:
        return None, None
    lo = max(1, total - SCAN + 1)
    try:
        typ, data = client.fetch("%d:%d" % (lo, total),
                                 "(UID BODY.PEEK[HEADER.FIELDS (SUBJECT TO DELIVERED-TO)])")
    except imaplib.IMAP4.error:
        return None, None
    if typ != "OK" or not data:
        return None, None
    items = [x for x in data if isinstance(x, tuple)]
    for meta, raw in reversed(items):
        uid = None
        try:
            found = re.search(br"UID (\d+)", meta)
            uid = found.group(1).decode("ascii") if found else None
        except (AttributeError, IndexError):
            uid = None
        code = code_from_header(raw, target)
        if code:
            return code, uid
    return None, None


def fetch_uid(client, uid, target):
    """按 UID 读一封。对上当前邮箱就返回码，否则返回 None。"""
    try:
        typ, data = client.uid("FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (SUBJECT TO DELIVERED-TO)])")
    except imaplib.IMAP4.error:
        return None
    if typ != "OK" or not data:
        return None
    for item in data:
        if isinstance(item, tuple) and len(item) >= 2:
            code = code_from_header(item[1], target)
            if code:
                return code
    return None


def delete_uid(client, uid):
    """按 UID 删信。删完垃圾箱仍保持打开。失败不影响已经写好的验证码。"""
    if not uid:
        return
    try:
        client.uid("STORE", uid, "+FLAGS", "\\Deleted")
        client.expunge()
        print("已删除验证码邮件", flush=True)
    except imaplib.IMAP4.error as exc:
        print("删除失败(不影响取码): %s" % exc, flush=True)


def new_uids(client, seen):
    """垃圾箱里还没看过的 UID。"""
    try:
        typ, data = client.uid("SEARCH", "ALL")
    except imaplib.IMAP4.error:
        return []
    if typ != "OK" or not data or not data[0]:
        return []
    fresh = []
    for uid in data[0].decode("ascii", "replace").split():
        if uid not in seen:
            seen.add(uid)
            fresh.append(uid)
    return fresh


def wait_push(client, seconds):
    """挂住垃圾箱等新信。返回 exists / timeout / noop / denied / error。"""
    if not supports_idle(client):
        time.sleep(seconds)
        try:
            client.noop()
        except imaplib.IMAP4.error:
            return "error"
        return "noop"
    got = "timeout"
    try:
        with client.idle(duration=seconds) as idler:
            for typ, data in idler:
                if typ == "EXISTS":
                    got = "exists"
                    break
                if typ == "RECENT" and data not in (None, b"0", "0"):
                    got = "exists"
                    break
    except (imaplib.IMAP4.abort, OSError, TimeoutError):
        return "error"
    except imaplib.IMAP4.error:
        return "denied"
    return got


def read_want():
    try:
        content = open(WANT, encoding="utf-8").read().strip()
    except OSError:
        return ""
    return content if "|" in content else ""


def take_code(client, target, seen, deadline):
    """先等 1 秒推送；没有就重开垃圾箱主动查。返回 (码, UID)。"""
    tries = 0
    while time.time() < deadline:
        if changed(target):
            print("目标已更换, 放弃: %s" % target, flush=True)
            return None, None
        tries += 1
        t_try = time.time()
        if not ensure_junk(client):
            raise imaplib.IMAP4.abort("junk not open")
        event = wait_push(client, min(PUSH_WAIT, max(0.2, deadline - time.time())))
        if event == "error":
            raise imaplib.IMAP4.abort("idle/noop failed")
        if event == "exists":
            fresh = new_uids(client, seen)
            for one in fresh:
                code = fetch_uid(client, one, target)
                if code:
                    print("  第%d次 %.1fs 推送命中" % (tries, time.time() - t_try), flush=True)
                    return code, one
        code, uid = find_code(client, target)
        if uid:
            seen.add(uid)
        print("  第%d次 %.1fs %s" % (tries, time.time() - t_try, "命中" if code else "无"), flush=True)
        if code:
            return code, uid
    return None, None


def target_of(content):
    if not content or "|" not in content:
        return ""
    return content.split("|", 1)[0].strip()


def changed(target):
    return target_of(read_want()) not in ("", target)


def already_written(out):
    try:
        return bool(open(out, encoding="utf-8").read().strip())
    except OSError:
        return False


def main():
    print("QQ 守望启动, 挂住垃圾箱等验证码...", flush=True)
    print("等待接收验证码", flush=True)
    client = connect()
    print("IDLE %s" % ("可用" if supports_idle(client) else "不可用, 改短轮询"), flush=True)
    open_junk(client)
    seen_key = ""
    seen = set()
    try:
        while True:
            content = read_want()
            if not content or content == seen_key:
                # 最多挂 5 秒就再看一次目标，避免新邮箱干等
                try:
                    if ensure_junk(client):
                        event = wait_push(client, IDLE_WAIT)
                        if event == "exists":
                            new_uids(client, seen)
                    else:
                        time.sleep(1)
                except imaplib.IMAP4.abort:
                    client = connect()
                    open_junk(client)
                continue
            seen_key = content
            target, runid = [x.strip() for x in content.split("|", 1)]
            out = REG + "/log/grok_otp_" + runid + ".txt"
            if already_written(out):
                print("已写入, 不再提取: %s" % target, flush=True)
                print("等待接收验证码", flush=True)
                continue
            print("提取验证码: %s (runid=%s)" % (target, runid), flush=True)
            t_start = time.time()
            deadline = time.time() + 180
            code = uid = None
            try:
                code, uid = take_code(client, target, seen, deadline)
            except imaplib.IMAP4.abort:
                client = connect()
            if changed(target):
                continue
            if not code:
                t_try = time.time()
                try:
                    code, uid = find_code(client, target)
                    print("  断线补查 %.1fs %s" % (time.time() - t_try, "命中" if code else "无"), flush=True)
                except imaplib.IMAP4.abort:
                    client = connect()
            if changed(target):
                continue
            print("  总耗时 %.0fs" % (time.time() - t_start), flush=True)
            if not code:
                print("超时未收到: %s" % target, flush=True)
                print("等待接收验证码", flush=True)
                continue
            print("提取成功: %s" % code, flush=True)
            open(out, "w", encoding="utf-8").write(code)
            print("写入验证码: %s" % code, flush=True)
            print("CODE_WRITTEN %s -> %s" % (code, out), flush=True)
            delete_uid(client, uid)
            if client.state != "SELECTED":
                open_junk(client)
            print("等待接收验证码", flush=True)
    finally:
        try:
            client.logout()
        except (imaplib.IMAP4.error, OSError):
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
