# AutoJs6 远程执行客户端 (VSCode-Extension v1.0.13 协议: TCP + 8 字节帧头)
# 用法: python3 autojs_run.py <脚本路径> [--wait 秒数]
# 自动探测本机 IP, 失败回退 127.0.0.1
import json, socket, struct, sys

TYPE_JSON = 1
PORT = 7347


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def recv_frame(s, timeout=6):
    s.settimeout(timeout)
    hdr = b""
    while len(hdr) < 8:
        c = s.recv(8 - len(hdr))
        if not c:
            raise ConnectionError("closed")
        hdr += c
    length = struct.unpack(">i", hdr[:4])[0]
    ftype = struct.unpack(">i", hdr[4:8])[0]
    payload = b""
    while len(payload) < length:
        c = s.recv(min(65536, length - len(payload)))
        if not c:
            raise ConnectionError("closed")
        payload += c
    return ftype, payload


def send_json(s, obj):
    data = json.dumps(obj).encode()
    s.sendall(struct.pack(">ii", len(data), TYPE_JSON) + data)


def connect(script_path):
    candidates = []
    ip = local_ip()
    if ip != "127.0.0.1":
        candidates.append(ip)
    candidates.append("127.0.0.1")
    last_err = None
    for host in candidates:
        try:
            s = socket.socket()
            s.settimeout(6)
            s.connect((host, PORT))
            ftype, payload = recv_frame(s)
            hello = json.loads(payload)
            print(f"已连接: {hello['data']['device_name']} ({hello['data']['app_version']}) @ {host}:{PORT}")
            return s
        except Exception as e:
            last_err = e
            print(f"(连接 {host}:{PORT} 失败: {e})")
    raise SystemExit(
        f"无法连接 AutoJs6 服务端(已试 {candidates}): {last_err}\n"
        "→ 请在 AutoJs6 侧边抽屉打开「服务端模式」"
    )


def main():
    if len(sys.argv) < 2:
        raise SystemExit("用法: python3 autojs_run.py <脚本路径> [--wait 秒数]")
    script_path = sys.argv[1]
    wait_s = 300
    if "--wait" in sys.argv:
        wait_s = int(sys.argv[sys.argv.index("--wait") + 1])

    with open(script_path, encoding="utf-8") as f:
        script = f.read()

    s = connect(script_path)
    send_json(s, {"id": 1, "type": "hello", "data": {"extensionVersion": "1.0.13"}})

    name = script_path.split("/")[-1]
    send_json(s, {"id": 2, "type": "command",
                  "data": {"command": "run", "id": "/" + name, "name": name, "script": script}})
    print(f"已下发 {name}, 实时日志:")

    s.settimeout(wait_s)
    logs = 0
    try:
        while True:
            ftype, payload = recv_frame(s, timeout=min(wait_s, 120))
            try:
                msg = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "log":
                line = msg["data"]["log"]
                print("  " + line.rstrip())
                logs += 1
                if "运行结束" in line:
                    print("(检测到脚本运行结束, 提前退出)")
                    break
            elif "result" in str(msg.get("type", "")) or msg.get("type") == "command_response":
                print("  [应答] " + payload[:200].decode(errors="replace"))
    except socket.timeout:
        print(f"(等待 {wait_s}s 无更多日志, 共收到 {logs} 条)")
    except (ConnectionError, OSError) as e:
        print(f"连接断开: {e}; 共收到 {logs} 条日志")
    finally:
        s.close()


main()
