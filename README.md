# autojs6-grok

**安卓手机上的 Grok 号池一条龙**：AutoJs6 全自动注册 + grok2api 网关 + 一键部署。

在一台 **Android + Termux** 手机上，从零搭起：

1. **自动注册**：AutoJs6 用 WebView 全自动注册 x.ai 账号（35~50 秒/号），产出
   账号密码、Web SSO、Build OAuth token
2. **统一网关**：grok2api 把整池账号包装成一个 **OpenAI 兼容接口**
   （`http://127.0.0.1:8000/v1`），支持文本/Agent 工具调用/图像/视频/语音
3. **一键部署**：`bash deploy/deploy.sh` 在另一台设备上复刻整套环境（3 分钟起）

> ⚠️ 仅限个人学习研究使用。请遵守 x.ai 服务条款，勿用于商业倒卖或滥用。

---

## 快速开始（部署到另一台设备）

在新设备的 Termux 里：

```bash
pkg install -y git
git clone https://github.com/daodaoyu123/autojs6-grok.git
cd autojs6-grok
bash deploy/deploy.sh --with-autojs6     # 一键部署（预编译包 1~3 分钟）
```

看到 `部署完成` 即好。管理与调用入口：

| 入口 | 位置 |
|------|------|
| 管理台 | `http://127.0.0.1:8000`（账号密码在 `~/grok2api_admin.txt`） |
| API | `http://127.0.0.1:8000/v1`（key 在 `~/grok2api_keys.txt`） |
| AutoJs6 脚本 | `/storage/emulated/0/Auto js6/`（域名邮箱注册 + grok 目录） |

### 常用参数

```bash
bash deploy/deploy.sh                 # 默认：预编译包优先，失败自动源码编译
bash deploy/deploy.sh --from-source   # 强制源码编译（需 go 1.26+ / node，15~30 分钟）
bash deploy/deploy.sh --with-autojs6  # 连 AutoJs6 注册脚本一起铺好
bash deploy/deploy.sh --port 9000     # 换端口
bash deploy/deploy.sh --no-autostart  # 不写开机自启
```

---

## 它长什么样

```
AutoJs6（注册机）                Termux（网关）                  客户端
┌───────────────┐   账号/SSO/   ┌──────────────────────┐
│ 域名邮箱注册.js│   token 文件  │ grok2api :8000       │   Hermes / OpenAI SDK
│ 临时邮箱脚本   │ ───────────► │  · 管理台 + OpenAI API│ ◄── grok CLI（:8802 转换层）
│ Outlook 链     │              │  · 多池轮换/熔断/守护  │ ── 你自己的程序（:8800 旧地址）
│ Console 入职   │ ◄── 下发 ──  │ grok_oauth :8799      │
└───────────────┘   （7347）    └──────────────────────┘
        ▲ 验证码                    ▲
   收验证码守望 ◄── QQ 垃圾箱 ◄── Forward Email ◄── 你的域名
```

细节见 [docs/05-架构说明.md](docs/05-架构说明.md)。

---

## 文档

| 文档 | 内容 |
|------|------|
| [01 · 部署教程](docs/01-部署教程-grok2api.md) | grok2api 从零部署（预编译 / 源码两条路）、配置、自启、升级、排障 |
| [02 · AutoJS6 注册部署](docs/02-AutoJS6注册部署.md) | AutoJs6 环境、三条注册链（域名邮箱 / 临时邮箱 / Outlook）、守望与 OAuth |
| [03 · 使用教程](docs/03-使用教程.md) | 管理台、导入账号、调 API、接 Hermes / grok CLI、图像/视频/语音 |
| [04 · 常见问题](docs/04-常见问题.md) | 部署与使用 FAQ（DNS 坑、pnpm 坑、硬链接坑、限速、共号警告…） |
| [05 · 架构说明](docs/05-架构说明.md) | 组件、端口、数据流、目录表、池的区别 |

---

## 仓库结构

```
autojs6-grok/
├── deploy/                 一键部署脚本组（deploy.sh 入口）
├── grok2api/
│   ├── patches/            Termux 硬链接补丁（基于上游 chenyme/grok2api v3.1.6）
│   ├── scripts/            启动器、CLI 转换层、旧地址转发、设备码 OAuth、守望启动
│   ├── tools/              管理/导入/冒烟/全模型测试工具（g2a_*.py）
│   └── config/             config.termux.yaml（真实配置由部署脚本现场生成）
├── autojs6/
│   ├── 域名邮箱注册/        主力流程（已定稿：域名邮箱 + QQ 守望）
│   ├── 临时邮箱/            DuckMail 临时邮箱流程（3 个脚本）
│   ├── outlook/             Outlook 链 + 批量脚本（零人工）
│   ├── console/             Console 入职脚本
│   └── bridge/              Termux → AutoJs6 下发桥（7347 协议）
├── docs/                   本套教程
└── README.md
```

---

## 实测数据（本机参考）

- 域名邮箱注册：**35~50 秒/号**，批量 10 轮 20 号零失败
- Web → Console 同步：**87/87** 成功（不用重新注册）
- 图像：`grok-imagine-image` 出图 ✓；视频：`grok-imagine-video` 720p ✓（6s / 5.6MB）
- 语音：TTS 真 MP3 ✓、STT 中英往返一字不差 ✓
- Agent 工具调用：grok-4.5 / 4.7 / composer / build 等 **7/8 全绿**（5/5 判定点）

## 兼容性

- Android 7+（arm64），Termux（F-Droid 版推荐）
- 预编译包在开发者设备（Android 14）构建；源码模式任意 Termux 可编
- 网络需能访问 `github.com` / `x.ai`（国内建议自备可用的代理出口）

## 安全设计

- 所有服务**只监听 `127.0.0.1`**；不暴露局域网/公网
- 密钥文件 `chmod 600`；`config.yaml` 真实密钥只存在设备上，永不进仓库
- 仓库 `.gitignore` 已屏蔽凭证文件（admin/keys/账号池/token）

## 致谢与许可

- 网关核心 [chenyme/grok2api](https://github.com/chenyme/grok2api)（MIT）
- 本项目（部署脚本、注册链、补丁、文档）MIT，见 [LICENSE](LICENSE)
