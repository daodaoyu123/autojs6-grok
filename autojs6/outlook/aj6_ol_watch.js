"auto";
auto.waitFor();
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_watch.txt";
var CMD = DIR + "/log/ol_cmd.txt";
var CODE_FILE = DIR + "/log/ol_authcode.txt";
var STATE = DIR + "/log/ol_state.json";
var POOL = DIR + "/outlook-accounts.txt";
var CLIENT = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
var TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }
try { files.write(LOG, ""); } catch (e) {}

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
            if (t || de || ed || cls === "Spinner") out.push({ n: n, t: t, d: de, cls: cls });
            for (var i = 0; i < n.childCount(); i++) walk(n.child(i), d + 1);
        } catch (e) {}
    }
    walk(root, 0);
    return out;
}
function words(limit) {
    var a = scan(), o = [];
    for (var i = 0; i < a.length && o.length < (limit || 16); i++) { var s = a[i].t || a[i].d; if (s) o.push(s.slice(0, 15)); }
    return o.join(" | ");
}
function has(w) { var a = scan(); for (var i = 0; i < a.length; i++) if ((a[i].t + "|" + a[i].d).indexOf(w) >= 0) return true; return false; }
function clickText(t) {
    var a = scan();
    for (var i = 0; i < a.length; i++) if (a[i].t === t) {
        var p = a[i].n;
        for (var k = 0; k < 8 && p; k++) { try { if (p.clickable()) break; } catch (e) {} p = p.parent(); }
        var ok = false; try { ok = (p || a[i].n).click(); } catch (e) {}
        return ok;
    }
    return "无[" + t + "]";
}
function workerAlive() { try { var hb = parseInt(String(files.read(DIR + "/log/ol_hb.txt")), 10); return (Date.now() - hb) < 20000; } catch (e) { return false; } }
function ensureWorker() {
    if (workerAlive()) return true;
    log("拉起 worker");
    try { engines.execScriptFile(DIR + "/aj6_ol_worker.js"); } catch (e) {}
    for (var i = 0; i < 20; i++) { sleep(1000); if (workerAlive()) { sleep(2500); return true; } }
    return false;
}
function sendCmd(c) {
    var raw = c + ":" + Date.now();
    files.write(CMD, raw);
    for (var i = 0; i < 30; i++) { sleep(500); try { if (String(files.read(CMD)).indexOf("done:" + raw) >= 0) return true; } catch (e) {} }
    return false;
}

threads.start(function () {
    try {
        log("===== 看守开始 =====");
        log("当前: " + words(14));
        var gone = false;
        for (var i = 0; i < 250 && !gone; i++) {   // 约 40 分钟
            var w = words(16);
            if (w === "") {
                if (i % 6 === 0) log("  读不到(前台 " + currentPackage() + ")");
                sleep(10000);
                continue;
            }
            if (w.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); sleep(3000); continue; }
            if (w.indexOf("长按") >= 0 || w.indexOf("可访问性挑战") >= 0 || w.indexOf("试一次") >= 0) {
                if (i % 3 === 0) log("  仍等手指按: " + w.slice(0, 60));
                sleep(10000);
                continue;
            }
            gone = true;
            log(">>> 挑战页已离开! " + w);
        }
        if (!gone) { log("40 分钟未过挑战, 看守退出"); return; }

        // 后置监控
        for (var p = 0; p < 60; p++) {
            sleep(3000);
            var w2 = words(16);
            if (w2 === "") continue;
            if (w2.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); continue; }
            if (p % 5 === 0) log("  监控: " + w2);
            if (w2.indexOf("欢迎") >= 0 || w2.indexOf("Microsoft 帐户") >= 0 || w2.indexOf("account.microsoft") >= 0) break;
        }

        // OAuth
        log("--- OAuth 授权 ---");
        ensureWorker();
        try { files.remove(CODE_FILE); } catch (e) {}
        sendCmd("auth");
        var got = false;
        for (var o = 0; o < 100 && !got; o++) {
            sleep(2000);
            try { if (files.exists(CODE_FILE)) got = true; } catch (e) {}
            if (!got && o % 5 === 0) {
                var w3 = words(14);
                log("  auth: " + w3.slice(0, 70));
                if (w3.indexOf("接受") >= 0) clickText("接受");
                if (w3.indexOf("继续") >= 0) clickText("继续");
                if (w3.indexOf("保持登录状态") >= 0) clickText("是");
            }
        }
        if (!got) { log("授权码未捕获取"); return; }
        log("授权码已捕获, 开始兑换");

        // 兑换 refresh_token
        var rawUrl = String(files.read(CODE_FILE));
        var m = /[?&]code=([^&\s]+)/.exec(rawUrl);
        if (!m) { log("URL 里解析不到 code: " + rawUrl.slice(0, 80)); return; }
        var code = decodeURIComponent(m[1]);
        var st = {};
        try { st = JSON.parse(files.read(STATE)); } catch (e) {}
        var body = "client_id=" + CLIENT
            + "&grant_type=authorization_code"
            + "&redirect_uri=" + encodeURIComponent("https://localhost")
            + "&scope=" + encodeURIComponent("https://outlook.office.com/IMAP.AccessAsUser.All offline_access")
            + "&code=" + encodeURIComponent(code);
        var r = http.post(TOKEN_URL, body, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        var tok = JSON.parse(r.body.string());
        if (tok.refresh_token) {
            var line = st.email + "----" + st.password + "----" + CLIENT + "----" + tok.refresh_token + "\n";
            var dup = false;
            try {
                var old = String(files.read(POOL));
                if (old.indexOf(st.email) >= 0) dup = true;
            } catch (e) {}
            if (!dup) files.append(POOL, line);
            log("兑换成功! refresh_token 长度 " + String(tok.refresh_token).length + (dup ? " (已存在,跳过)" : " 已入池: " + POOL));
            log("账号: " + st.email);
        } else {
            log("兑换失败: " + String(r.body.string()).slice(0, 200));
        }
        log("===== 看守结束 =====");
    } catch (e) { log("异常: " + e); }
});
