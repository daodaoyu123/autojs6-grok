"auto";
auto.waitFor();
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_after.txt";
var CMD = DIR + "/log/ol_cmd.txt";
var CODE_FILE = DIR + "/log/ol_authcode.txt";
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
            if (t || de || ed || cls === "Spinner") out.push({ n: n, t: t, d: de, cls: cls, b: n.bounds() });
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
function clickText(t) {
    var a = scan();
    for (var i = 0; i < a.length; i++) if (a[i].t === t) {
        var p = a[i].n;
        for (var k = 0; k < 8 && p; k++) { try { if (p.clickable()) break; } catch (e) {} p = p.parent(); }
        var ok = false; try { ok = (p || a[i].n).click(); } catch (e) {}
        return ok;
    }
    return "无";
}
function frontOk() { try { return String(currentPackage()) === "org.autojs.autojs6"; } catch (e) { return false; } }
function workerAlive() {
    try { var hb = parseInt(String(files.read(DIR + "/log/ol_hb.txt")), 10); return (Date.now() - hb) < 15000; } catch (e) { return false; }
}
function ensureWorker() {
    if (workerAlive()) return true;
    log("拉起 worker");
    try { engines.execScriptFile(DIR + "/aj6_ol_worker.js"); } catch (e) {}
    for (var i = 0; i < 20; i++) { sleep(1000); if (workerAlive()) return true; }
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
        log("===== 续跑开始 =====");
        for (var i = 0; i < 150; i++) {
            sleep(2000);
            var w = words(18);
            if (w === "") { if (i % 15 === 0) log("读不到(前台 " + currentPackage() + ")"); continue; }
            if (w.indexOf("保持登录状态") >= 0) { log("保持登录: " + clickText("是")); sleep(2500); continue; }
            if (w.indexOf("接受") >= 0) { log("接受: " + clickText("接受")); sleep(2500); continue; }
            if (w.indexOf("继续") >= 0) { log("继续: " + clickText("继续")); sleep(2500); continue; }
            if (i % 6 === 0) log("  [" + ts() + "] " + w);
            if (w.indexOf("欢迎") >= 0 || w.indexOf("Microsoft 帐户") >= 0 || w.indexOf("account.microsoft") >= 0) break;
        }
        log("当前页面: " + words(18));
        log("--- OAuth ---");
        ensureWorker();
        try { files.remove(CODE_FILE); } catch (e) {}
        sendCmd("auth");
        var got = false;
        for (var o = 0; o < 80 && !got; o++) {
            sleep(2000);
            try { if (files.exists(CODE_FILE)) got = true; } catch (e) {}
            if (!got && o % 6 === 0) {
                var w4 = words(14);
                log("  auth监控: " + w4);
                if (w4.indexOf("接受") >= 0) clickText("接受");
                if (w4.indexOf("继续") >= 0) clickText("继续");
                if (w4.indexOf("保持登录状态") >= 0) clickText("是");
            }
        }
        log("授权码: " + (got ? "已捕获" : "未捕获"));
        log("===== 续跑结束 =====");
    } catch (e) { log("异常: " + e); }
});
