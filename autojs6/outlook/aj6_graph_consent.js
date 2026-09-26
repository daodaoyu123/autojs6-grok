"auto";
// aj6_graph_consent.js —— 驱动"补 Graph 授权"流程: 登录 -> 同意 -> 等回调码
// 用法: 先推 aj6_ol_worker_graph.js(带 login_hint), 再推本脚本; 它自动填表/点同意, 等 CODE 文件出现
auto.waitFor();
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/graph_consent.txt";
var CODE_FILE = DIR + "/log/ol_code_graph.txt";
var EMAIL = "__EMAIL__";
var PASSWORD = "__PASSWORD__";
var TIMEOUT_S = 150;

function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }

function scan() {
    var out = [], roots = auto.windowRoots;
    for (var w = 0; w < roots.length; w++) {
        try {
            if (String(roots[w].packageName()) !== "org.autojs.autojs6") continue;
            (function walk(n, d) {
                if (!n || d > 50) return;
                try {
                    var t = String(n.text() || ""), de = String(n.desc() || ""), cl = String(n.className() || "");
                    if (t || de || cl.indexOf("Edit") >= 0) out.push({ n: n, t: t, d: de, cl: cl });
                    for (var i = 0; i < n.childCount(); i++) walk(n.child(i), d + 1);
                } catch (e) {}
            })(roots[w], 0);
        } catch (e) {}
    }
    return out;
}
function words(limit) {
    var a = scan(), o = [];
    for (var i = 0; i < a.length && o.length < (limit || 20); i++) { var s = a[i].t || a[i].d; if (s) o.push(s.slice(0, 14)); }
    return o.join(" | ");
}
function editables() {
    var a = scan(), out = [];
    for (var i = 0; i < a.length; i++) {
        if (a[i].cl.indexOf("EditText") >= 0) { try { if (a[i].n.isEditable()) out.push(a[i].n); } catch (e) {} }
    }
    return out;
}
function hasIn(a, kw) {
    for (var i = 0; i < a.length; i++) { var s = a[i].t + " " + a[i].d; if (s.indexOf(kw) >= 0) return true; }
    return false;
}
function clickText(txt) {
    var a = scan();
    for (var i = 0; i < a.length; i++) {
        if ((a[i].t === txt || a[i].d === txt)) {
            try { if (a[i].n.click()) return true; } catch (e) {}
            try { var b = a[i].n.bounds(); if (b.width() > 0) { a[i].n.click(); return true; } } catch (e) {}
        }
    }
    return false;
}

function main() {
    try { files.write(LOG, ""); } catch (e) {}
    log("===== Graph 授权驱动启动: " + EMAIL + " =====");
    var t0 = Date.now();
    var emailDone = false, pwDone = false, lastW = "";
    while (Date.now() - t0 < TIMEOUT_S * 1000) {
        if (files.exists(CODE_FILE)) { log(">>> 回调码已捕获, 完成!"); log("CONSENT_DONE"); return; }
        var a = scan();
        var w = words();
        if (w !== lastW) { log("  页面: " + w.slice(0, 90)); lastW = w; }
        // 保持登录
        if (hasIn(a, "保持登录状态")) { log("保持登录: " + clickText("是")); sleep(2000); continue; }
        // 同意页: 各种按钮
        if (hasIn(a, "想要访问") || hasIn(a, "代表你") || hasIn(a, "访问你的信息") || hasIn(a, "已代表你授权")) {
            var clicked = false;
            var btns = ["接受", "允许", "是", "继续", "同意", "Yes", "Accept"];
            for (var i = 0; i < btns.length; i++) { if (clickText(btns[i])) { log("同意: 点了 [" + btns[i] + "]"); clicked = true; break; } }
            sleep(2500); if (clicked) continue;
        }
        // 登录页 -> 邮箱
        if (hasIn(a, "电子邮件") || hasIn(a, "登录") || hasIn(a, "Sign in") || hasIn(a, "帐户")) {
            var eds = editables();
            if (eds.length > 0) {
                var cur = "";
                try { cur = String(eds[0].text() || ""); } catch (e) {}
                if (cur.indexOf("@") < 0 && !emailDone) {
                    try { eds[0].setText(EMAIL); } catch (e) {}
                    sleep(500); emailDone = true;
                    log("填邮箱: " + clickText("下一步"));
                    sleep(2500); continue;
                }
            }
        }
        // 密码页
        if (hasIn(a, "密码") && !hasIn(a, "忘记密码")) {
            var eds2 = editables();
            if (eds2.length > 0 && !pwDone) {
                try { eds2[0].setText(PASSWORD); } catch (e) {}
                sleep(500); pwDone = true;
                log("填密码: " + clickText("登录"));
                sleep(3000); continue;
            }
        }
        sleep(1500);
    }
    log("超时未完成 (" + TIMEOUT_S + "s)");
    log("CONSENT_DONE");
}
main();
