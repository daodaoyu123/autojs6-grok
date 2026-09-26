"auto";
auto.waitFor();
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_run.txt";
var STATE = DIR + "/log/ol_state.json";
var CMD = DIR + "/log/ol_cmd.txt";
var CODE_FILE = DIR + "/log/ol_authcode.txt";
var DUCK = "https://api.duckmail.sbs";

function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }
function rnd(n) { var c = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
try { files.write(LOG, ""); } catch (e) {}

// ---------- 控件层 ----------
function rootOf() {
    var roots = auto.windowRoots;
    for (var w = 0; w < roots.length; w++) {
        try { if (String(roots[w].packageName()) === "org.autojs.autojs6") return roots[w]; } catch (e) {}
    }
    return null;
}
function scan() {
    var out = [], root = rootOf();
    if (!root) return out;
    function walk(n, d) {
        if (!n || d > 50) return;
        try {
            var t = String(n.text() || ""), de = String(n.desc() || ""), ed = false, cls = String(n.className() || "").split(".").pop();
            try { ed = n.editable(); } catch (e) {}
            if (t || de || ed || cls === "Spinner") out.push({ n: n, t: t, d: de, ed: ed, cls: cls, b: n.bounds() });
            for (var i = 0; i < n.childCount(); i++) walk(n.child(i), d + 1);
        } catch (e) {}
    }
    walk(root, 0);
    return out;
}
function pageWords(limit) {
    var a = scan(), o = [];
    for (var i = 0; i < a.length && o.length < (limit || 16); i++) { var s = a[i].t || a[i].d; if (s) o.push(s.slice(0, 15)); }
    return o.join(" | ");
}
function has(word) { var a = scan(); for (var i = 0; i < a.length; i++) if ((a[i].t + "|" + a[i].d).indexOf(word) >= 0) return true; return false; }
function waitHas(word, sec) { for (var i = 0; i < sec; i++) { if (has(word)) return true; sleep(1000); } return false; }
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
function frontOk() { try { return String(currentPackage()) === "org.autojs.autojs6"; } catch (e) { return false; } }
function frontWait(sec) {
    for (var i = 0; i < (sec || 60); i++) {
        if (frontOk()) return true;
        if (i % 6 === 0) { try { device.wakeUp(); } catch (e) {} }
        if (i > 0 && i % 15 === 0) log("  等前台(" + currentPackage() + ") " + i + "s");
        sleep(1000);
    }
    return frontOk();
}
function pickSpinner(optText, waitSec) {
    // 在已展开的列表中点击选项
    for (var t = 0; t < (waitSec || 8); t++) {
        var a = scan();
        for (var i = 0; i < a.length; i++) if (a[i].t === optText) {
            var p = a[i].n; for (var k = 0; k < 8 && p; k++) { try { if (p.clickable()) break; } catch (e) {} p = p.parent(); }
            var ok = false; try { ok = (p || a[i].n).click(); } catch (e) {}
            return ok;
        }
        sleep(1000);
    }
    return false;
}
function spinners() {
    var a = scan(), o = [];
    for (var i = 0; i < a.length; i++) if (a[i].cls === "Spinner") o.push(a[i]);
    o.sort(function (x, y) { return (x.b.centerY() - y.b.centerY()) || (x.b.centerX() - y.b.centerX()); });
    return o;
}
function pickComboByIndex(idx, optText, verifyText, tries) {
    for (var t = 1; t <= (tries || 4); t++) {
        var s = spinners();
        if (idx >= s.length) { log("  组合" + idx + ": 无Spinner"); return false; }
        if (String(s[idx].t) === verifyText) return true; // 已是目标值
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
        } else {
            log("  未展开");
            sleep(1200);
        }
    }
    return false;
}

// ---------- 邮箱/命令 ----------
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
    try {
        var hb = parseInt(String(files.read(DIR + "/log/ol_hb.txt")), 10);
        return (Date.now() - hb) < 15000;
    } catch (e) { return false; }
}
function ensureWorker() {
    if (workerAlive()) return true;
    log("worker 不在, 拉起");
    try { engines.execScriptFile(DIR + "/aj6_ol_worker.js"); } catch (e) { log("拉起失败 " + e); }
    for (var i = 0; i < 20; i++) { sleep(1000); if (workerAlive()) { log("worker 已就绪"); sleep(2500); return true; } }
    log("worker 起不来");
    return false;
}

// ---------- 主流程 ----------
threads.start(function () {
    try {
        log("===== 流程开始 =====");
        var st = newMailbox();
        files.write(STATE, JSON.stringify(st));
        log("邮箱: " + st.email);
        ensureWorker();
        sendCmd("signup");
        sleep(4500);

        var phase = "?";
        log("等待注册页回到前台(最多10分钟)...");
        frontWait(600);
        ensureWorker();
        sendCmd("signup");
        sleep(4000);
        for (var attempt = 1; attempt <= 3; attempt++) {
            log("--- 尝试 " + attempt + " ---");
            if (waitHas("同意并继续", 16)) { log("同意: " + clickText("同意并继续")); sleep(4000); }
            if (waitHas("电子邮件", 20)) {
                var eds = editables();
                if (eds.length > 0) eds[0].setText(st.email);
                sleep(600);
                log("邮箱下一步: " + clickText("下一步"));
                sleep(4500);
            }
            if (waitHas("验证你的电子邮件", 22)) {
                var code = duckCode(st.jwt);
                log("验证码: " + code);
                if (code) {
                    var boxes = editables();
                    log("框数: " + boxes.length);
                    if (boxes.length >= 6) { for (var k = 0; k < 6; k++) boxes[k].setText(code.charAt(k)); }
                    else if (boxes.length > 0) boxes[0].setText(code);
                    sleep(3500);
                    if (waitHas("下一步", 2) && has("验证你的电子邮件")) { clickText("下一步"); sleep(4000); }
                }
                phase = "code";
                break;
            }
            if (has("已有帐户") || has("已存在")) {
                log("已被注册, 换邮箱");
                st = newMailbox(); files.write(STATE, JSON.stringify(st));
                log("新邮箱: " + st.email);
                sendCmd("signup"); sleep(4500);
                continue;
            }
            log("!! 邮箱后未知: " + pageWords());
            break;
        }

        // 生日页
        frontWait(60);
        if (waitHas("详细信息", 25)) {
            log("--- 生日页 ---");
            log("Spinner数: " + spinners().length);
            log("国家: " + pickComboByIndex(0, "中国", "中国", 4));
            log("月: " + pickComboByIndex(1, "6月", "6月", 5));
            log("日: " + pickComboByIndex(2, "15日", "15日", 5));
            var y = null, ee = editables(); if (ee.length > 0) y = ee[0];
            if (y) log("填年: " + y.setText("1995"));
            sleep(800);
            log("生日状态: " + pageWords(20));
            log("生日下一步: " + clickText("下一步"));
            if (!waitHas("添加姓名", 10)) {
                log("未进姓名页, 补选");
                log("月: " + pickComboByIndex(1, "6月", "6月", 3));
                log("日: " + pickComboByIndex(2, "15日", "15日", 3));
                log("再下一步: " + clickText("下一步"));
                waitHas("添加姓名", 12);
            }
            sleep(1500);
        }
        // 姓名页
        frontWait(60);
        if (waitHas("添加姓名", 20)) {
            var eds2 = editables();
            log("姓名框: " + eds2.length);
            if (eds2.length >= 2) { eds2[0].setText("Zhang"); eds2[1].setText("Wei"); }
            sleep(600);
            log("姓名下一步: " + clickText("下一步"));
            sleep(5000);
        }
        // 挑战页 + 挑战后监控(合并): 控件出现就按, 直到页面真正跳走
        ensureWorker();
        frontWait(120);
        log("--- 挑战/监控 ---");
        var chalTries = 0, warm = 0;
        for (var p2 = 0; p2 < 160; p2++) {
            sleep(2000);
            var w3 = pageWords(18);
            if (w3 === "") { if (p2 % 10 === 0) log("  [" + ts() + "] 读不到(前台 " + currentPackage() + ")"); continue; }
            if (w3.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); sleep(2500); continue; }
            var wid = null, wb = null, all = scan();
            for (var i4 = 0; i4 < all.length; i4++) if ((all[i4].t + all[i4].d).indexOf("可访问性挑战") >= 0) {
                if (!wb || all[i4].b.width() * all[i4].b.height() > wb.width() * wb.height()) { wid = all[i4].n; wb = all[i4].b; }
            }
            if (wid && wb.width() < 400 && warm < 10) { warm++; log("  控件未就绪(" + wb.width() + "px), 等"); sleep(2500); continue; }
            var paused = false;
            try { paused = files.exists(DIR + "/log/ol_pause.txt"); } catch (e) {}
            if (paused && p2 % 5 === 0) log("  [暂停] 检测到 ol_pause.txt, 只监控不按");
            if (wid && chalTries < 10 && !paused) {
                if (!frontOk()) { if (p2 % 5 === 0) log("  挑战在但非前台"); continue; }
                chalTries++;
                var cx = wb.centerX(), cy = wb.centerY();
                if (chalTries % 3 === 0) { cx = 729; cy = 1682; }
                log("长按第" + chalTries + "次 @" + cx + "," + cy + " 30s gesture");
                try { gesture(30000, [cx, cy], [cx + 2, cy + 2]); }
                catch (e) { log("  gesture失败, 用press: " + e); press(cx, cy, 30000); }
                sleep(3500);
                log("  按后: " + pageWords(14));
                continue;
            }
            if (!wid && p2 % 6 === 0) log("  [" + ts() + "] " + w3);
            if (w3.indexOf("欢迎") >= 0 || w3.indexOf("Microsoft 帐户") >= 0 || w3.indexOf("account.microsoft") >= 0) break;
        }
        log("注册后页面: " + pageWords(18));

        // OAuth 授权
        log("--- OAuth ---");
        ensureWorker();
        frontWait(45);
        try { files.remove(CODE_FILE); } catch (e) {}
        sendCmd("auth");
        var got = false;
        for (var o = 0; o < 80 && !got; o++) {
            sleep(2000);
            try { if (files.exists(CODE_FILE)) got = true; } catch (e) {}
            if (!got && o % 6 === 0) {
                var w4 = pageWords(12);
                log("  auth监控: " + w4);
                if (w4.indexOf("接受") >= 0) clickText("接受");
                if (w4.indexOf("继续") >= 0) clickText("继续");
                if (w4.indexOf("保持登录状态") >= 0) clickText("是");
            }
        }
        log("授权码: " + (got ? "已捕获" : "未捕获"));
        log("===== 流程结束 =====");
    } catch (e) { log("异常: " + e); }
});
