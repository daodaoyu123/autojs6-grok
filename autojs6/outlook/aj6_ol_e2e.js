"auto";
// aj6_ol_e2e.js —— Outlook(微软)注册 全链一把梭控制器 v2
// 相对 aj6_ol_run.js(v1) 的优化:
//  1) 挑战页绝不再自动推进/误发 auth: v1 等待循环跑满后会直接掉进 OAuth 分支, 会把页面带去登录页(实测踩坑)
//  2) 单脚本全链: 建邮箱 → 注册表单 → 挑战交手指 → 后续监控 → OAuth → 抓码 → 兑换 → 入池
//  3) 挑战页不注入任何点击(实测 5 种注入全被 PerimeterX 拒), 只 toast + 震动提醒人按
//  4) 恢复路径: 退回登录页 → 自动点「创建帐户」重来; 被阻止/报错页 → 明确终止并提示
auto.waitFor();
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_e2e.txt";
var STATE = DIR + "/log/ol_state.json";
var CMD = DIR + "/log/ol_cmd.txt";
var CODE_FILE = DIR + "/log/ol_authcode.txt";
var POOL = DIR + "/outlook-accounts.txt";
var DUCK = "https://api.duckmail.sbs";
var CLIENT = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
var TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
var PKG = "org.autojs.autojs6";

function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }
try { files.write(LOG, ""); } catch (e) {}
try { files.remove(CODE_FILE); } catch (e) {}
try { files.write(CMD, "noop:0"); } catch (e) {}   // 清掉上次遗留命令

// ---------- 控件层 ----------
function rootOf() {
    var roots = auto.windowRoots;
    for (var w = 0; w < roots.length; w++) {
        try { if (String(roots[w].packageName()) === PKG) return roots[w]; } catch (e) {}
    }
    return null;
}
function scan() {
    var out = [], root = rootOf();
    if (!root) return out;
    (function walk(n, d) {
        if (!n || d > 60) return;
        try {
            var t = String(n.text() || ""), de = String(n.desc() || ""), ed = false, cls = String(n.className() || "").split(".").pop();
            try { ed = n.editable(); } catch (e) {}
            if (t || de || ed || cls === "Spinner") out.push({ n: n, t: t, d: de, ed: ed, cls: cls, b: n.bounds() });
            for (var i = 0; i < n.childCount(); i++) walk(n.child(i), d + 1);
        } catch (e) {}
    })(root, 0);
    return out;
}
function wordsOf(a, limit) {
    var o = [];
    for (var i = 0; i < a.length && o.length < (limit || 16); i++) { var s = a[i].t || a[i].d; if (s) o.push(s.slice(0, 15)); }
    return o.join(" | ");
}
function pageWords(limit) { return wordsOf(scan(), limit); }
function hasIn(a, w) { for (var i = 0; i < a.length; i++) if ((a[i].t + "|" + a[i].d).indexOf(w) >= 0) return true; return false; }
function has(w) { return hasIn(scan(), w); }
function waitHas(w, sec) { for (var i = 0; i < sec; i++) { if (has(w)) return true; sleep(1000); } return false; }
function findText(t) { var a = scan(); for (var i = 0; i < a.length; i++) if (a[i].t === t) return a[i].n; return null; }
function editables() { var a = scan(), o = []; for (var i = 0; i < a.length; i++) if (a[i].ed) o.push(a[i].n); return o; }
function clickNode(n) {
    if (!n) return false;
    var p = n;
    for (var k = 0; k < 8 && p; k++) { try { if (p.clickable()) break; } catch (e) {} p = p.parent(); }
    var t = p || n, ok = false;
    try { ok = t.click(); } catch (e) {}
    if (!ok) { try { var b = t.bounds(); click(b.centerX(), b.centerY()); ok = "XY"; } catch (e) {} }
    return ok;
}
function clickText(t) { var n = findText(t); if (!n) return "无[" + t + "]"; return clickNode(n); }
function frontOk() { try { return String(currentPackage()) === PKG; } catch (e) { return false; } }
function launchAj() { try { app.launchPackage(PKG); } catch (e) {} }
function frontWait(sec) {
    sec = sec || 60;
    for (var i = 0; i < sec; i++) {
        if (frontOk()) return true;
        if (i % 6 === 0) { try { device.wakeUp(); } catch (e) {} }
        if (i > 0 && i % 20 === 0) { log("  等前台(" + currentPackage() + "), 拉一把 AutoJs6"); launchAj(); }
        sleep(1000);
    }
    return frontOk();
}
function pickComboByIndex(idx, optText, verifyText, tries) {
    for (var t = 1; t <= (tries || 4); t++) {
        var s = spinners();
        if (idx >= s.length) { log("  组合" + idx + ": 无Spinner"); return false; }
        if (String(s[idx].t) === verifyText) return true;
        log("  组合" + idx + " 第" + t + "试 当前[" + s[idx].t + "]");
        clickNode(s[idx].n);
        var hit = null;
        for (var w = 0; w < 9; w++) { sleep(900); hit = findText(optText); if (hit) break; }
        if (hit) {
            clickNode(hit);
            sleep(1600);
            var s2 = spinners();
            if (idx < s2.length && String(s2[idx].t) === verifyText) return true;
            log("  选项点了但值未变");
        } else { log("  未展开"); sleep(1200); }
    }
    return false;
}
function spinners() {
    var a = scan(), o = [];
    for (var i = 0; i < a.length; i++) if (a[i].cls === "Spinner") o.push(a[i]);
    o.sort(function (x, y) { return (x.b.centerY() - y.b.centerY()) || (x.b.centerX() - y.b.centerX()); });
    return o;
}

// ---------- 邮箱 / 命令 ----------
function rnd(n) { var c = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
function newMailbox() {
    var r = http.get(DUCK + "/domains", {});
    var arr = JSON.parse(r.body.string())["hydra:member"];
    var doms = [];
    for (var i = 0; i < arr.length; i++) if (arr[i].isVerified) doms.push(arr[i].domain);
    var dom = doms[Math.floor(Math.random() * doms.length)];
    var addr = "ob" + rnd(8) + "@" + dom;
    var mpw = "Px" + rnd(12);
    try { http.postJson(DUCK + "/accounts", { address: addr, password: mpw, expiresIn: 0 }, {}); } catch (e) {}
    var tok = http.postJson(DUCK + "/token", { address: addr, password: mpw }, {});
    var jwt = JSON.parse(tok.body.string()).token;
    return { email: addr, mailPw: mpw, jwt: jwt, password: "Ol" + rnd(6) + "9#Kx" };
}
function duckCode(jwt) {
    for (var k = 0; k < 60; k++) {
        sleep(3000);
        try {
            var r = http.get(DUCK + "/messages", { headers: { Authorization: "Bearer " + jwt } });
            var arr = JSON.parse(r.body.string())["hydra:member"] || [];
            for (var i = 0; i < arr.length; i++) {
                var d = http.get(DUCK + "/messages/" + arr[i].id, { headers: { Authorization: "Bearer " + jwt } });
                var dj = JSON.parse(d.body.string());
                var html = dj.html; if (Array.isArray(html)) html = html.join(" ");
                var raw = (dj.text || "") + " " + String(html || "").replace(/<[^>]+>/g, " ");
                var m = raw.match(/安全代码[:：]?\s*(\d{4,8})/); if (!m) m = raw.match(/\b(\d{6})\b/);
                if (m) return m[1];
            }
        } catch (e) {}
    }
    return null;
}
function sendCmd(c) {
    var raw = c + ":" + Date.now();
    files.write(CMD, raw);
    for (var i = 0; i < 30; i++) {
        sleep(500);
        try { if (String(files.read(CMD)).indexOf("done:" + raw) >= 0) return true; } catch (e) {}
    }
    return false;
}
function workerAlive() {
    try { var hb = parseInt(String(files.read(DIR + "/log/ol_hb.txt")), 10); return (Date.now() - hb) < 15000; } catch (e) { return false; }
}
function ensureWorker() {
    if (workerAlive()) return true;
    log("worker 不在, 拉起");
    try { engines.execScriptFile(DIR + "/aj6_ol_worker.js"); } catch (e) { log("拉起失败 " + e); }
    for (var i = 0; i < 25; i++) { sleep(1000); if (workerAlive()) { log("worker 已就绪"); sleep(2500); return true; } }
    log("!! worker 起不来");
    return false;
}
function retireWorker() {
    if (!workerAlive()) return;
    log("旧 worker 还在, 发送 quit 让它退出");
    try { sendCmd("quit"); } catch (e) {}
    for (var i = 0; i < 20; i++) { sleep(500); if (!workerAlive()) { log("旧 worker 已退出"); return; } }
    log("!! 旧 worker 10 秒没退, 继续(有风险)");
}
function clearCookies() {
    try {
        importClass(android.webkit.CookieManager);
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        log("已清 WebView Cookie");
    } catch (e) { log("清 Cookie 异常: " + e); }
}

// ---------- 页面识别 ----------
function challengeOn(w) { return w.indexOf("长按") >= 0 || w.indexOf("可访问性挑战") >= 0 || w.indexOf("证明你不是机器人") >= 0 || w.indexOf("请再试一次") >= 0; }
function pageKind(a) {
    if (hasIn(a, "我们遇到了问题")) return "报错";
    if (hasIn(a, "已被阻止") || hasIn(a, "异常活动")) return "被阻止";
    if (hasIn(a, "证明你不是机器人") || hasIn(a, "长按该按钮") || hasIn(a, "可访问性挑战")) return "挑战";
    if (hasIn(a, "验证你的电子邮件") || hasIn(a, "重新发送代码")) return "验证码";
    if (hasIn(a, "添加一些详细信息") || hasIn(a, "出生日期")) return "生日";
    if (hasIn(a, "添加姓名")) return "姓名";
    if (hasIn(a, "同意并继续")) return "同意";
    if (hasIn(a, "使用你的 Microsoft 帐户") || hasIn(a, "电子邮件或电话号码")) return "登录";
    if (hasIn(a, "电子邮件")) return "邮箱";
    return a.length ? "其他" : "空";
}

// ---------- 主流程 ----------
threads.start(function () {
    try {
        log("===== E2E 流程开始 (v2) =====");
        try { device.keepScreenOn(); } catch (e) {}
        try { device.wakeUp(); } catch (e) {}

        retireWorker();
        clearCookies();
        var st = newMailbox();
        files.write(STATE, JSON.stringify(st));
        log("邮箱: " + st.email);
        ensureWorker();
        sendCmd("signup");
        sleep(4500);
        frontWait(90);

        // —— 阶段1: 表单驱动 ——
        var stop = driveSignup(8, st);
        for (var heal = 1; heal <= 2 && stop === "worker死"; heal++) {
            log("worker 死后自愈 " + heal + "/2: 重新拉起 + 重进注册页");
            ensureWorker();
            sendCmd("signup"); sleep(4500);
            frontWait(90);
            stop = driveSignup(8, st);
        }
        log("注册驱动停止于: " + stop);

        var fin = false;
        if (stop === "挑战") {
            var rf = waitFinger(40);
            log("手指验证: " + rf);
            if (rf === "离开") {
                var rs = settle(2.5);
                log("监控: " + rs);
                if (rs !== "报错" && rs !== "超时" && rs !== "worker死") {
                    var ra = doAuth(10, st);
                    log("OAuth: " + ra);
                    if (ra === "捕获") {
                        var re = exchangeAndPool(st);
                        fin = (re === "成功");
                    }
                }
            }
        }
        if (stop === "被阻止") { try { toast("注册被微软拦截(IP被标记), 换节点再试"); } catch (e) {} }
        if (stop === "报错") { try { toast("微软页面报错, 稍后可重跑"); } catch (e) {} }
        if (fin) { try { toast("注册成功, 账号已入池!"); } catch (e) {} }
        log(fin ? "E2E 结束: 成功" : "E2E 结束: 未完成 (" + stop + ")");
    } catch (e) { log("异常: " + e); log("E2E 结束: 异常"); try { toast("本轮异常, 请看日志"); } catch (e2) {} }
});

// —— 阶段1: 注册表单驱动(同意/邮箱/验证码/生日/姓名), 遇到挑战/异常即返回 ——
function driveSignup(minutes, st) {
    var t0 = Date.now(), lastKind = "", lastLogAt = 0, restarts = 0, codeTries = 0;
    while (Date.now() - t0 < minutes * 60000) {
        if (!workerAlive()) { log("!! worker 死亡, 中止"); return "worker死"; }
        if (!frontOk()) {
            if ((Date.now() - lastLogAt) > 15000) { log("  等前台(" + currentPackage() + ")"); lastLogAt = Date.now(); launchAj(); }
            sleep(2000); continue;
        }
        var a = scan();
        var k = pageKind(a);
        if (k !== lastKind) { log("页面: " + k + " | " + wordsOf(a, 12).slice(0, 100)); lastKind = k; }
        if (k === "同意") { log("  点 [同意并继续]: " + clickText("同意并继续")); sleep(4000); continue; }
        if (k === "验证码") {
            codeTries++;
            var code = null;
            if (codeTries <= 2) code = duckCode(st.jwt);
            log("验证码: " + code + (codeTries > 2 ? " (第" + codeTries + "轮, 只等)" : ""));
            if (code) {
                var boxes = editables();
                log("  框数: " + boxes.length);
                if (boxes.length >= 6) { for (var x = 0; x < 6; x++) { try { boxes[x].setText(code.charAt(x)); } catch (e) {} } }
                else if (boxes.length > 0) { try { boxes[0].setText(code); } catch (e) {} }
                sleep(3500);
                if (has("下一步")) log("  验证码下一步: " + clickText("下一步"));
            }
            sleep(4000); continue;
        }
        if (k === "生日") {
            log("--- 生日页 --- Spinner数 " + spinners().length);
            log("  国家: " + pickComboByIndex(0, "中国", "中国", 4));
            log("  月: " + pickComboByIndex(1, "6月", "6月", 5));
            log("  日: " + pickComboByIndex(2, "15日", "15日", 5));
            var ee = editables();
            if (ee.length > 0) log("  年: " + ee[0].setText("1995"));
            sleep(900);
            log("  生日下一步: " + clickText("下一步"));
            if (!waitHas("添加姓名", 12)) {
                log("  没进姓名页, 补选月日");
                pickComboByIndex(1, "6月", "6月", 3); pickComboByIndex(2, "15日", "15日", 3);
                log("  再下一步: " + clickText("下一步"));
                waitHas("添加姓名", 12);
            }
            sleep(1500); continue;
        }
        if (k === "姓名") {
            var es = editables();
            log("  姓名框: " + es.length);
            if (es.length >= 2) { try { es[0].setText("Zhang"); es[1].setText("Wei"); } catch (e) {} }
            else if (es.length === 1) { try { es[0].setText("Zhang Wei"); } catch (e) {} }
            sleep(700);
            log("  姓名下一步: " + clickText("下一步"));
            sleep(5000); continue;
        }
        if (k === "邮箱") {
            var eds = editables();
            if (eds.length > 0) { try { eds[0].setText(st.email); } catch (e) {} }
            sleep(700);
            log("  邮箱下一步: " + clickText("下一步"));
            sleep(4500); continue;
        }
        if (k === "登录") {
            restarts++;
            if (restarts > 4) { log("  !! 反复回登录页, 终止"); return "循环"; }
            log("  退回登录页, 点 [创建帐户] 重来(" + restarts + "): " + clickText("创建帐户"));
            sleep(4500); continue;
        }
        if (k === "挑战") return "挑战";
        if (k === "报错") return "报错";
        if (k === "被阻止") return "被阻止";
        sleep(2500);
    }
    return "超时";
}

// —— 阶段2: 挑战页, 交手指, 等待离开 ——
function waitFinger(minutes) {
    log(">>> 到验证页! 求解器自动长按处理中(三次都失败才震动) <<<");
    launchAj(); sleep(1500);
    var t0 = Date.now(), lastTip = 0;
    while (Date.now() - t0 < minutes * 60000) {
        if (!workerAlive()) { log("!! worker 死亡, 中止"); return "worker死"; }
        if (!frontOk()) { launchAj(); sleep(2500); continue; }
        var w = pageWords(20);
        if (w !== "" && !challengeOn(w)) {
            sleep(1600);
            var w2 = pageWords(20);
            if (w2 !== "" && !challengeOn(w2)) { log("挑战页已离开 -> " + w2.slice(0, 110)); return "离开"; }
        }
        if (w.indexOf("我们遇到了问题") >= 0) { log("!! 挑战后 MS 报错页"); return "报错"; }
        if (w.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); sleep(2500); continue; }
        if ((Date.now() - lastTip) > 25000) {
            lastTip = Date.now();
            var el = Math.round((Date.now() - t0) / 1000);
            log("  等人长按... (" + el + "s) 页面: " + w.slice(0, 60));
            try { toast("请长按按钮完成验证（已等 " + el + "s）"); } catch (e) {}
        }
        sleep(2500);
    }
    log("!! 等待长按超时");
    return "超时";
}

// —— 阶段3: 挑战后的完成页监控(点 保持登录/接受/继续) ——
function settle(minutes) {
    log("--- 监控注册完成页 ---");
    var t0 = Date.now(), lastW = "", lastEvent = Date.now(), lastBeat = 0;
    while (Date.now() - t0 < minutes * 60000) {
        if (!workerAlive()) { log("!! worker 死亡, 中止"); return "worker死"; }
        if (!frontOk()) { launchAj(); sleep(2500); continue; }
        var w = pageWords(20);
        if (w === "") { sleep(2500); continue; }
        if (w.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); sleep(2500); lastEvent = Date.now(); continue; }
        if (w.indexOf("接受") >= 0) { log("接受: " + clickText("接受")); sleep(2500); lastEvent = Date.now(); continue; }
        if (w.indexOf("继续") >= 0) { log("继续: " + clickText("继续")); sleep(2500); lastEvent = Date.now(); continue; }
        if (w.indexOf("我们遇到了问题") >= 0) { log("!! MS 报错页"); return "报错"; }
        if (challengeOn(w)) { log("挑战又出现了, 交手指"); var r = waitFinger(15); if (r === "报错" || r === "worker死") return "报错"; lastEvent = Date.now(); continue; }
        if (w !== lastW) { log("  当前页: " + w.slice(0, 110)); lastW = w; lastEvent = Date.now(); }
        else {
            var quiet = Date.now() - lastEvent;
            if (quiet > 30000) { log("  完成页已静默 " + Math.round(quiet / 1000) + "s, 判定稳定, 提前进入 OAuth"); return "稳定"; }
            if (Date.now() - lastBeat > 12000) { lastBeat = Date.now(); log("  稳定监控: 静默 " + Math.round(quiet / 1000) + "s / " + (minutes * 60) + "s"); }
        }
        sleep(3000);
    }
    return "稳定";
}

// —— 阶段4: OAuth 授权 + 抓码 ——
function doAuth(minutes, st) {
    log("--- OAuth 授权 ---");
    ensureWorker();
    frontWait(45);
    try { files.remove(CODE_FILE); } catch (e) {}
    sendCmd("auth");
    var t0 = Date.now(), lastW = "", emailDone = false, pwDone = false, resend = 0, lastProgress = Date.now();
    while (Date.now() - t0 < minutes * 60000) {
        try { if (files.exists(CODE_FILE)) { log("授权码: 已捕获"); return "捕获"; } } catch (e) {}
        if (!workerAlive()) {
            if (resend >= 3) { log("!! worker 反复死亡, 放弃"); return "worker死"; }
            resend++;
            log("!! worker 死亡, 重拉并重发 auth (" + resend + "/3)");
            ensureWorker(); sleep(2000);
            try { files.remove(CODE_FILE); } catch (e) {}
            sendCmd("auth"); sleep(3000);
            lastProgress = Date.now();
            continue;
        }
        if (!frontOk()) { launchAj(); sleep(2500); continue; }
        var a = scan();
        var w = wordsOf(a, 16);
        if (w === "") { sleep(2500); continue; }
        if (w.indexOf("网页无法打开") >= 0 || w.indexOf("ERR_") >= 0) {
            if (resend >= 3) { log("!! 授权页反复加载失败, 放弃"); return "报错"; }
            resend++;
            log("授权页加载失败, 重发 auth (" + resend + "/3)");
            try { files.remove(CODE_FILE); } catch (e) {}
            sendCmd("auth"); sleep(4000);
            lastProgress = Date.now();
            continue;
        }
        if (Date.now() - lastProgress > 110000) {
            if (resend >= 3) { log("!! 授权页长时间无进展, 放弃"); return "未捕获"; }
            resend++;
            log("授权页 110s 无进展, 重发 auth (" + resend + "/3)");
            try { files.remove(CODE_FILE); } catch (e) {}
            sendCmd("auth"); sleep(3000);
            lastProgress = Date.now();
            continue;
        }
        if (hasIn(a, "长按") || hasIn(a, "可访问性挑战") || hasIn(a, "证明你不是机器人")) {
            log("!! OAuth 过程中出现挑战, 交手指");
            var r = waitFinger(15);
            if (r === "报错" || r === "worker死") return "报错";
            continue;
        }
        if (hasIn(a, "电子邮件或电话号码") || hasIn(a, "使用你的 Microsoft 帐户")) {
            var eds = editables();
            if (eds.length > 0) {
                if (!emailDone) { try { eds[0].setText(st.email); } catch (e) {} sleep(600); emailDone = true; }
                log("  OAuth登录-下一步: " + clickText("下一步"));
                sleep(3500); continue;
            }
        }
        if (hasIn(a, "密码") && !hasIn(a, "忘记密码")) {
            var eds2 = editables();
            if (eds2.length > 0) {
                if (!pwDone) { try { eds2[0].setText(st.password); } catch (e) {} sleep(600); pwDone = true; }
                log("  OAuth登录-提交: " + clickText("登录") + "/" + clickText("下一步"));
                sleep(4000); continue;
            }
        }
        if (hasIn(a, "接受")) { log("接受: " + clickText("接受")); sleep(2800); continue; }
        if (hasIn(a, "继续")) { log("继续: " + clickText("继续")); sleep(2800); continue; }
        if (hasIn(a, "保持登录状态")) { log("保持登录: " + clickText("是")); sleep(2800); continue; }
        if (hasIn(a, "我们遇到了问题") || hasIn(a, "无法登录")) { log("!! OAuth 出错: " + w.slice(0, 90)); return "报错"; }
        if (w !== lastW) { log("  auth监控: " + w.slice(0, 110)); lastW = w; lastProgress = Date.now(); }
        sleep(2200);
    }
    return "未捕获";
}

// —— 阶段5: 兑换 refresh_token 并入池 ——
function exchangeAndPool(st) {
    var rawUrl = "";
    try { rawUrl = String(files.read(CODE_FILE)); } catch (e) {}
    var m = /[?&]code=([^&\s]+)/.exec(rawUrl);
    if (!m) { log("!! URL 解析不到 code: " + rawUrl.slice(0, 100)); return "失败"; }
    var code = decodeURIComponent(m[1]);
    var txt = "", tok = null;
    try {
        var r = http.post(TOKEN_URL, {
            client_id: CLIENT,
            grant_type: "authorization_code",
            redirect_uri: "https://localhost",
            scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
            code: code
        }, {});
        txt = String(r.body.string());
        try { tok = JSON.parse(txt); } catch (e) {}
    } catch (e2) { txt = "http.post 异常: " + e2; }
    if (tok && tok.refresh_token) {
        var dup = false;
        try { if (String(files.read(POOL)).indexOf(st.email) >= 0) dup = true; } catch (e) {}
        if (!dup) { try { files.append(POOL, st.email + "----" + st.password + "----" + CLIENT + "----" + tok.refresh_token + "\n"); } catch (e) {} }
        log("兑换成功! refresh_token 长度 " + String(tok.refresh_token).length + (dup ? " (已存在,跳过)" : " 已入池: " + POOL));
        log("账号: " + st.email);
        return "成功";
    }
    log("!! 兑换失败: " + txt.slice(0, 200));
    log("   (授权码已留在 " + CODE_FILE + ", 可用 ~/bin/ol_exchange.py 备用兑换)");
    return "失败";
}
