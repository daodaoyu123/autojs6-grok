# 01 · grok2api 部署教程（Android / Termux）

本教程把一整池 Grok 账号包装成一个 **OpenAI 兼容接口**，跑在你自己的手机上（只监听本机 `127.0.0.1`）。
全程零 Docker，直接跑在 Termux 里。

---

## 1. 部署产物一览

| 项目 | 位置 | 说明 |
|------|------|------|
| grok2api 主程序 | `~/repos/grok2api/grok2api` | Go 单文件二进制 |
| 前端管理台 | `~/repos/grok2api/frontend/dist` | 运行时同源托管（非编译进二进制） |
| 配置 | `~/repos/grok2api/config.yaml` | 随机密钥已生成，600 权限 |
| 管理员密码 | `~/grok2api_admin.txt` | 600 权限，勿外传 |
| 客户端 Key | `~/grok2api_keys.txt` | 调 API 用，600 权限 |
| 启动器 | `~/bin/grok2api-up.sh` | 幂等：已在跑就退出 |
| CLI 转换层 | `~/bin/grok-shim-up.sh` + `grok-cli-shim.py` | 让 grok CLI 也能打网关（8802） |
| 旧地址兼容 | `~/bin/grok-8800-up.sh` + `grok-8800-alias.py` | 8800 → 8000 转发 + 自动登录 |
| 设备码 token 服务 | `~/bin/grok-oauth-up.sh` + 工作区 `grok_oauth.py` | 注册时拿 Build token（8799） |

**端口表**（都在本机回环）：

| 端口 | 角色 |
|------|------|
| 8000 | grok2api 本体（管理台 + API） |
| 8802 | grok CLI 转换层（shim，只给 CLI 用） |
| 8800 | 旧地址转发 → 8000（带零输入自动登录） |
| 8799 | 设备码 OAuth 控制服务（注册链用） |
| 7347 | AutoJs6 服务端模式（AutoJs6 App 开的，Termux 下发脚本用） |

---

## 2. 前置要求

- Android 手机 + **Termux**（推荐 F-Droid 版）
- 能稳定访问 `github.com`、`x.ai`（国内网络请先开 VPN / 快橙节点）
- 磁盘空间 ≥ 1.5 GB（源码编译模式）
- 存储权限：在 Termux 里执行过一次 `termux-setup-storage` 并允许

```bash
# 首次准备（新装 Termux 只需做一次）
pkg update -y
termux-setup-storage
```

---

## 3. 一键部署（推荐）

```bash
pkg install -y git
git clone https://github.com/daodaoyu123/autojs6-grok.git
cd autojs6-grok
bash deploy/deploy.sh                 # 默认：预编译包优先，失败自动转源码编译
```

要连 AutoJs6 注册脚本一起铺好：

```bash
bash deploy/deploy.sh --with-autojs6
```

装完你会看到 `部署完成` 总结，末尾列出管理台地址、密钥文件和下一步。

### 部署脚本都做了什么

1. `install-deps.sh` —— 装 git/curl/jq/openssl/python（源码模式加装 golang/nodejs-lts）
2. `fetch-prebuilt.sh` 或 `build-grok2api.sh` —— 取本体（预编译包从本项目 Releases 下载并校验 sha256；源码模式克隆上游 v3.1.6 并打 Termux 补丁）
3. `gen-config.sh` —— 生成 `config.yaml`（三处密钥全随机）+ 管理员密码
4. `install-runtime.sh` —— 装启动器到 `~/bin`、建工作目录、写开机自启
5. 启动 + `verify.sh` 验证（健康检查 / 管理端登录 / 客户端 Key / 模型列表）

### 两种取本体方式的区别

| 方式 | 耗时 | 需要 | 说明 |
|------|------|------|------|
| 预编译包（默认） | 1~3 分钟 | 网络 | 开发者手机（arm64）构建，一般 Android 7+ 直接跑 |
| 源码编译 `--from-source` | 15~30 分钟 | go 1.26+、node | 克隆上游 + 打补丁 + 编译前端后端 |

源码编译模式下**千万别**显式指定 `GOOS=linux CGO_ENABLED=0`（脚本已避开）：Android 没有
`/etc/resolv.conf`，纯 Go DNS 解析器会回退 `[::1]:53`，导致账号导入后全部同步失败。
用 Termux 默认目标（GOOS=android + bionic）编译即正常。

---

## 4. 手动分步（想看每一步时用）

```bash
cd autojs6-grok
bash deploy/install-deps.sh            # 1. 依赖
bash deploy/fetch-prebuilt.sh          # 2. 取本体（或 bash deploy/build-grok2api.sh）
bash deploy/gen-config.sh --port 8000  # 3. 配置
bash deploy/install-runtime.sh --autostart   # 4. 运行时 + 自启
~/bin/grok2api-up.sh 8000              # 5. 启动
bash deploy/verify.sh --port 8000      # 6. 验证
```

手动启动（不用启动器）：

```bash
cd ~/repos/grok2api
./grok2api --config config.yaml --listen 127.0.0.1:8000
```

---

## 5. 配置说明（config.yaml）

模板在 `grok2api/config/config.termux.yaml`，与上游 `config.example.yaml` 一致。
`gen-config.sh` 会替换三处并生成 `~/repos/grok2api/config.yaml`：

| 字段 | 生成方式 | 注意 |
|------|----------|------|
| `secrets.jwtSecret` | `openssl rand -hex 32` | 丢了只是要重登 |
| `secrets.credentialEncryptionKey` | `openssl rand -base64 32` | **写入账号后不能换**，换了已有凭据全废 |
| `bootstrapAdmin.password` | 随机 18 位 | 写入 `~/grok2api_admin.txt` |

想改端口就 `--port 9000` 重新生成，或者直接编辑 `config.yaml` 里的 `server.listen`。

数据库默认 sqlite（`~/repos/grok2api/data/backend.db`），单机够用。

---

## 6. 开机自启

`install-runtime.sh --autostart` 会做两件事：

1. **`~/.bashrc` 钩子**：每次打开 Termux 静默拉起网关和 shim（幂等，不重复起）
2. **`~/.termux/boot/00-grok-router.sh`**：装了 [Termux:Boot](https://f-droid.org/packages/com.termux.boot/) 应用后，开机即拉起

不想自启就加 `--no-autostart`。

---

## 7. 验证清单

```bash
curl -s http://127.0.0.1:8000/healthz          # 1. 健康检查
python3 ~/bin/g2a_admin.py login               # 2. 管理端登录（读 admin 文件密码）
python3 ~/bin/g2a_smoke.py                     # 3. 模型列表 + 真实对话（需已导入账号）
```

`g2a_smoke.py` 失败但 `healthz` 通 = 网关活着，只是池里还没有可用账号 —— 去
[02 · AutoJS6 注册部署](02-AutoJS6注册部署.md) 造号，或按 [03 · 使用教程](03-使用教程.md) 导入。

---

## 8. 升级 / 重装 / 卸载

**升级**（保持数据不动）：

```bash
cd autojs6-grok && git pull
bash deploy/deploy.sh --force          # 覆盖运行时脚本；config.yaml 若存在要覆盖需 --force
# 源码模式升级：bash deploy/build-grok2api.sh（脚本会 fetch 最新 tag 并重编译）
```

**重装配置**（密钥会变，账号要重导）：

```bash
bash deploy/gen-config.sh --force && ~/bin/grok2api-up.sh
```

**卸载**：

```bash
pkill -f "grok2api --config" ; pkill -f grok-cli-shim ; pkill -f grok-8800-alias
rm -rf ~/repos/grok2api ~/bin/grok2api-up.sh ~/bin/grok-shim-up.sh ~/bin/grok-8800-up.sh \
       ~/bin/grok-cli-shim.py ~/bin/grok-8800-alias.py ~/bin/g2a_*.py
# 再从 ~/.bashrc 删掉自启钩子
```

---

## 9. 故障排查（部署相关）

| 症状 | 原因 / 解法 |
|------|-------------|
| 导入账号后 `synced=0, syncFailed=N` | 用错了编译目标（见第 3 节 DNS 坑），重编译 |
| 前端页面 404 / 白屏 | `frontend/dist` 缺了；源码模式重跑 `pnpm build`，预编译模式重下包 |
| `pnpm install` 报 @pnpm/exe android 找不到 | 别用系统 pnpm，用脚本里的 `~/.pnpm11/bin/pnpm`（v11.5.2） |
| 出图报 `storage failed ... link ... permission denied` | 没打硬链接补丁；源码模式确认补丁已应用（`grep commitNoReplace backend/internal/infra/media/local_store.go`） |
| 管理台登录反复 429 | 固定 1 分钟窗口限速（IP 30/分、用户名 12/分），等一分钟，别反复点 |
| 端口被占 | `ss -tlnp` 看谁占着 8000，或换端口重生成 |
| 手机重启后服务没起 | 看是否装了 Termux:Boot，或手动开一次 Termux |

更多问题见 [04 · 常见问题](04-常见问题.md)。
