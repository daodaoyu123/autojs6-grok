# 02 · AutoJS6 自动注册部署教程

用安卓手机上的 **AutoJs6**，通过 WebView 全自动注册 x.ai / Grok 账号，
一次跑完拿到三样东西：**账号密码、Web SSO、Build OAuth token**，直接能导入 grok2api 号池。

实测：单号全程 **35~50 秒**（域名邮箱流程），批量跑 10 轮 20 个号零失败。

---

## 1. AutoJs6 环境准备

1. 安装 **AutoJs6**（开源版，GitHub: `SuperMonster003/AutoJs6`，或 F-Droid）
2. 打开 AutoJs6，授予这些权限：
   - **存储**：选「允许管理所有文件」
   - **无障碍服务**：系统设置里给 AutoJs6 打开
   - **后台运行不受限制**：系统电池设置里放开（否则熄屏会冻结进程）
3. 侧边抽屉 → 打开 **「服务端模式」**（端口 `7347`）—— Termux 侧批量下发靠它
4. 脚本目录：`/storage/emulated/0/Auto js6/`（默认，脚本放好后 App 里直接可见）

部署脚本会把所有注册脚本铺到位：

```bash
cd autojs6-grok
bash deploy/deploy-autojs6.sh          # 已存在文件默认不覆盖；--force 覆盖
```

---

## 2. 三条注册链怎么选

| 流程 | 邮箱来源 | 依赖 | 适用 |
|------|----------|------|------|
| **域名邮箱注册**（主力，已定稿） | 自己域名随机子域（如 `*.445908.xyz`） | 域名 + Forward Email 转发 + QQ 邮箱守望 | 批量最大、最稳，可无限跑 |
| **临时邮箱**（DuckMail） | `api.duckmail.sbs` 临时邮箱 | 无（开箱即用） | 起步试水、轻量补充 |
| **Outlook 链**（全自动批量） | 预先备好的 Outlook 账号池 | Outlook 账号池 + 长按求解器 | 已有 Outlook 账号时批量 |

三者产出的账号/SSO/token 格式一致，导入 grok2api 的方式也一样。

---

## 3. 域名邮箱注册（主力流程，定稿版）

### 3.1 原理

脚本在 AutoJs6 里开一个真实 WebView（系统浏览器内核），自动完成：

1. 生成 `g<随机>@<随机>.445908.xyz` 邮箱 → 打开 `accounts.x.ai/sign-up`
2. 自动填表、过 Cloudflare Turnstile 人机验证（真实触摸优先）、提交
3. 验证码发到域名 → 经 **Forward Email** 转入 **QQ 邮箱垃圾箱** → Termux 侧的
   「收验证码守望」取出 `NNN-NNN` 验证码写入文件 → 脚本读入填表
4. 填个人资料，从 Cookie 取出 **SSO**（152 字符）
5. 走设备码 OAuth（Termux 侧 `grok_oauth.py` 在 `127.0.0.1:8799` 配合），拿到 **Build refresh token**
6. 结果分别写入三个文件（见 3.4）

全程**零坐标点击**：所有按钮都是找控件再 `click()`；页面顶部有原生状态条（不随页面跳转消失）。

### 3.2 前置依赖

- **域名**（本例 `445908.xyz`）已在 **Forward Email** 配置：`*@*.445908.xyz → 你的 QQ 邮箱`
- **QQ 邮箱**开了 IMAP，且拿到授权码，存到：
  - 授权码：`~/.config/himalaya/qq.secret`（一行）
  - 邮箱地址：`~/.config/himalaya/qq.user`（一行），或设环境变量 `OTP_QQ_USER`
- 改域名/邮箱规则：改 `域名邮箱注册.js` 顶部 `pickEmail()` 与守望的目标匹配即可

### 3.3 怎么跑

```bash
# 1) Termux 里先起守望（收验证码）+ 设备码 OAuth 服务（8799），一条命令
bash ~/bin/start-watch.sh

# 2) AutoJs6 里打开并运行「域名邮箱注册.js」（脚本目录 /storage/emulated/0/Auto js6/域名邮箱注册/）
#    顶部状态条会显示阶段：等待接收验证码 → 提取验证码 → 提取成功 → 写入验证码
```

- 轮数在脚本顶部：`var ROUNDS = 10000;`（一跑到底；想少跑就改小）
- 守望常驻，空闲不会自己退出；重跑脚本自动切到新邮箱目标
- **冻结说明**：`域名邮箱注册.js` 与 `收验证码守望.py` 已定稿冻结，别改这俩文件；
  要改功能另建子目录（如 `试验/`）

### 3.4 产出物（全部在 `/storage/emulated/0/Hermes工作区/grok/`）

| 文件 | 内容 |
|------|------|
| `grok_accounts.txt` | `邮箱----密码` 每行一个 |
| `sso_from_autojs.txt` | `邮箱----sso` 每行一个（Web 池用） |
| `/storage/emulated/0/Download/QQ/grok api/xai-<邮箱>.json` | Build OAuth token 文件（Build 池用） |
| `log/grok_otp_<runid>.txt` | 本轮取到的验证码 |
| `log/grok_signup_webview.log` | 注册脚本日志 |
| `log/watch_run.txt` | 守望日志 |

### 3.5 常见问题

| 症状 | 处理 |
|------|------|
| 状态条一直「等待接收验证码」 | 守望没起 / QQ 授权码错 / Forward Email 转发规则没生效 |
| Turnstile 卡住不过 | 脚本会重试；仍卡就换 VPN 节点（出口 IP 被风控） |
| x.ai 提示邮箱不可用（disposable） | 换子域重试（脚本已内置轮换） |
| 脚本跑一半熄屏冻结 | 后台运行不受限制没放开 |

---

## 4. 临时邮箱流程（DuckMail，开箱即用）

不需要域名和 QQ，最简起步：

```bash
# 1) Termux 起设备码 OAuth 服务（拿 Build token 用；只要 SSO 可跳过）
~/bin/grok-oauth-up.sh

# 2) AutoJs6 里运行 /storage/emulated/0/Auto js6/grok /grok_signup_webview.js
#    轮数在顶部：var ROUNDS = 2;
```

三个脚本任选：

| 脚本 | 用途 |
|------|------|
| `grok_signup_webview.js` | 单路注册（推荐起步） |
| `grok_signup_bg.js` | 开头自动按 Home 退后台挂机跑 |
| `grok_signup_2thread.js` | 两个 WebView 并行（约 28 秒/号） |

也可以从 Termux 全自动下发（需要 AutoJs6 服务端模式开着）：

```bash
python3 ~/bin/grok_signup_webview.py 5 --import   # 跑 5 轮，结束后自动导入 grok2api
```

---

## 5. Outlook 注册链（全自动批量，零人工）

适用于有一批 Outlook 邮箱（`outlook-accounts.txt` 池）的情况。批量脚本会自动：

1. 下发「长按求解器」`aj6_chal_color.js` + 注册链 `aj6_ol_e2e.js`（经 `autojs_run.py` → AutoJs6 7347）
2. 人机验证全自动（零截图 + 9.5 秒长按）；求解器自动重试 6 次全败才震动转人工
3. 每轮最多尝试 2 次；检测到「被阻止」立即停止（IP 被微软标记 → 换 VPN 节点重跑）

```bash
bash ~/bin/ol_batch.sh 3 330        # 轮数=3，每轮间隔 330 秒
tail -f "/storage/emulated/0/Hermes工作区/grok/log/ol_batch.log"   # 看进度
```

相关文件（都已同步到工作区/脚本目录）：
`aj6_ol_e2e.js`（注册链）、`aj6_chal_color.js`（求解器）、`aj6_killall.js`（清残留引擎）、
`aj6_graph_consent.js`、`aj6_ol_worker*.js`、`ol_batch.sh`、`ol_exchange.py`、`ol_verify.py`。

---

## 6. Console 入职（可选，扩展能力）

给已有的 Web 账号批量建 **Grok Console**（console.x.ai）团队账号（视频/TTS/更多模型）：

- 脚本：`console_onboard_batch.js`（AutoJs6 目录 `grok /` 下）
- 已在库的号秒跳过；白屏连续 2 号自动中止
- 关键坑：**必须同时设 `sso` 与 `sso-rw` 两个 cookie（同值）**，否则报 "RW cookie required"
- 跑完用 `python3 ~/bin/g2a_sync_console.py missing` 把 Console 同步进池

---

## 7. 注册完之后

注册成功 ≠ 已入 grok2api 池。把三份产物导入对应池：

```bash
python3 ~/bin/g2a_import_new.py --since 60      # Build 池：最近 60 分钟的 token 文件
python3 ~/bin/g2a_web_test.py                    # Web 池：导入 sso 并跑预处理
python3 ~/bin/g2a_sync_console.py missing        # Console 池：从 Web 号同步
```

详见 [03 · 使用教程](03-使用教程.md)。
