# 7347 不是 websocket(是原生 TCP 帧协议: 4字节大端总长 + 4字节type + JSON)。
# 按 hello 帧格式回帧, 再发 JSON-RPC
import json, os, socket, struct

HOST = os.environ.get("AUTOJS_HOST") or "127.0.0.1"
PORT = 7347

def recv_frame(s):
    hdr = b""
    while len(hdr) < 8:
        chunk = s.recv(8 - len(hdr))
        if not chunk:
            raise ConnectionError("closed")
        hdr += chunk
    total = struct.unpack(">I", hdr[:4])[0]
    ftype = struct.unpack(">I", hdr[4:8])[0]
    payload = b""
    while len(payload) < total - 8:
        chunk = s.recv(min(8192, total - 8 - len(payload)))
        if not chunk:
            raise ConnectionError("closed")
        payload += chunk
    return ftype, payload

s = socket.socket(); s.settimeout(6)
s.connect((HOST, PORT))
ftype, payload = recv_frame(s)
print("hello type:", ftype, "payload:", payload[:150].decode(errors="replace"))

# 回 hello(客户端身份)
msg = json.dumps({"type": "hello", "data": {"client_name": "hermes-termux", "version": "1.0"}}).encode()
frame = struct.pack(">I", len(msg) + 4) + struct.pack(">I", 1) + msg
s.sendall(frame)
print("已回 hello 帧")

# 发 JSON-RPC authorize
rpc = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "debug.authorize", "params": {"token": ""}}).encode()
frame = struct.pack(">I", len(rpc) + 4) + struct.pack(">I", 1) + rpc
s.sendall(frame)
try:
    ftype, payload = recv_frame(s)
    print("authorize 应答 type:", ftype, ":", payload[:300].decode(errors="replace"))
except socket.timeout:
    print("authorize 无应答(6s)")

s.close()
