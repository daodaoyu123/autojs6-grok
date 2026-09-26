# 用 WebSocket 连 AutoJs6 服务端(7347), 按 ws-rpc 协议 authorize + 执行脚本
# 协议: JSON-RPC 2.0 over WebSocket, 帧 = 4字节大端type + 4字节? + payload(从 mcp protocol.js 逆向)
import asyncio, json, os, struct, sys

HOST = os.environ.get("AUTOJS_HOST") or "127.0.0.1"
PORT = 7347

async def main():
    try:
        import websockets
    except ImportError:
        print("需要 websockets: pip install websockets")
        sys.exit(1)

    async with websockets.connect(f"ws://{HOST}:{PORT}") as ws:
        # 第一条消息(服务端主动发 hello)
        try:
            first = await asyncio.wait_for(ws.recv(), timeout=3)
            print("服务端 hello:", first[:200])
        except asyncio.TimeoutError:
            print("(服务端无主动 hello)")

        # authorize: AutoJs6 的开放服务端模式一般无 token 或 token 为空
        req = {"jsonrpc": "2.0", "id": 1, "method": "debug.authorize", "params": {"token": ""}}
        await ws.send(json.dumps(req))
        try:
            resp = await asyncio.wait_for(ws.recv(), timeout=5)
            print("authorize 应答:", resp[:300])
        except asyncio.TimeoutError:
            print("authorize 超时")

asyncio.run(main())
