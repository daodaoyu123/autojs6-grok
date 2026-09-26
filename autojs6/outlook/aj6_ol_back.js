"auto";
auto.waitFor();
var LOG = "/storage/emulated/0/Hermes工作区/grok/log/ol_back.txt";
function log(m) { console.log(m); try { files.append(LOG, m + "\n"); } catch (e) {} }
try { files.write(LOG, ""); } catch (e) {}
function rootOf() {
    var roots = auto.windowRoots;
    for (var w = 0; w < roots.length; w++) { try { if (String(roots[w].packageName()) === "org.autojs.autojs6") return roots[w]; } catch (e) {} }
    return null;
}
function findText(t) {
    var hit = null;
    (function walk(n, d) {
        if (!n || d > 60 || hit) return;
        try { if (String(n.text() || "") === t) hit = n; for (var i = 0; i < n.childCount() && !hit; i++) walk(n.child(i), d + 1); } catch (e) {}
    })(rootOf(), 0);
    return hit;
}
log("前台 " + currentPackage());
var n = findText("创建帐户");
if (!n) { log("没找到 创建帐户"); }
else {
    var p = n; for (var k = 0; k < 8 && p; k++) { try { if (p.clickable()) break; } catch (e) {} p = p.parent(); }
    var ok = false; try { ok = (p || n).click(); } catch (e) {}
    log("点 创建帐户 -> " + ok);
}
sleep(4000);
var w = [];
(function walk2(n, d) {
    if (!n || d > 60 || w.length > 10) return;
    try { var t = String(n.text() || ""); if (t) w.push(t.slice(0, 14)); for (var i = 0; i < n.childCount(); i++) walk2(n.child(i), d + 1); } catch (e) {}
})(rootOf(), 0);
log("点后: " + w.join(" | "));
log("BACK_DONE");
