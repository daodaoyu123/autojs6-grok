# 精确复刻 VSCode 插件握手:
# 帧头: 4字节 int32BE = payload长度(不含8字节头), 4字节 type
# 设备发 hello 后客户端必须发 {id, type:"hello", data:{extensionVersion}}
# 收到 hello 中的 device 后发 command
import json, os, socket, struct, sys, time

HOST = os.environ.get("AUTOJS_HOST") or "127.0.0.1"
PORT = 7347
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

s = socket.socket()
s.connect((HOST, PORT))

ftype, payload = recv_frame(s)
hello = json.loads(payload)
print("设备:", hello["data"]["device_name"], hello["data"]["app_version"], "id:", hello.get("id"))

# 回 hello: VSCode 插件源码 sendHello() data = {extensionVersion}
send_json(s, {"id": 1, "type": "hello", "data": {"extensionVersion": "1.0.13"}})
print("已回 hello")

# 等 attach 后设备会推什么; 然后发命令 toast (脚本执行入口是 run)
try:
    for _ in range(3):
        ftype, payload = recv_frame(s, timeout=4)
        print("设备消息:", payload[:250].decode(errors="replace"))
except socket.timeout:
    print("(等待消息超时, 继续发命令)")

# 发 run 命令: 源码字段是 {id: 文件路径, name: 文件名, script: 代码}
script = 'toast("Hermes 连接成功"); console.log("hello from hermes");'
send_json(s, {"id": 2, "type": "command", "data": {"command": "run", "id": "/hermes_test.js", "name": "hermes_test.js", "script": script}})
print("已发 run 命令")
try:
    for _ in range(4):
        ftype, payload = recv_frame(s, timeout=5)
        print("运行应答:", payload[:250].decode(errors="replace"))
except socket.timeout:
    print("(无更多应答)")

s.close()
print("完成")
