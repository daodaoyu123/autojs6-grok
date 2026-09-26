# 尝试让 AutoJs6 停止正在运行的远程脚本, 并列出当前引擎
import json, socket, struct, sys

HOST, PORT = "127.0.0.1", 7347
TYPE_JSON = 1

def recv_frame(s, timeout=6):
    s.settimeout(timeout)
    hdr = b""
    while len(hdr) < 8:
        c = s.recv(8 - len(hdr))
        if not c: raise ConnectionError("closed")
        hdr += c
    length = struct.unpack(">i", hdr[:4])[0]
    ftype = struct.unpack(">i", hdr[4:8])[0]
    payload = b""
    while len(payload) < length:
        c = s.recv(min(65536, length - len(payload)))
        if not c: raise ConnectionError("closed")
        payload += c
    return ftype, payload

def send_json(s, obj):
    data = json.dumps(obj).encode()
    s.sendall(struct.pack(">ii", len(data), TYPE_JSON) + data)

target = sys.argv[1] if len(sys.argv) > 1 else "/grok_batch_v3.js"
s = socket.socket(); s.connect((HOST, PORT))
ftype, payload = recv_frame(s)
print("已连接:", json.loads(payload)["data"]["device_name"])
send_json(s, {"id": 1, "type": "hello", "data": {"extensionVersion": "1.0.13"}})

for cmd in ("stop",):
    send_json(s, {"id": 2, "type": "command", "data": {"command": cmd, "id": target, "name": target.split("/")[-1]}})
    print("已发送 stop 尝试:", cmd)
    try:
        ft, pl = recv_frame(s, timeout=4)
        print("  回应:", pl[:300].decode(errors="replace"))
    except socket.timeout:
        print("  (无回应)")

# 查询运行中的脚本
send_json(s, {"id": 3, "type": "command", "data": {"command": "list"}})
try:
    ft, pl = recv_frame(s, timeout=4)
    print("list 回应:", pl[:500].decode(errors="replace"))
except socket.timeout:
    print("list: (无回应)")
s.close()
