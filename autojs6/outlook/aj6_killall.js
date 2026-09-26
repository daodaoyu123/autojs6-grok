"auto";
auto.waitFor();
var LOG = "/storage/emulated/0/Hermes工作区/grok/log/ol_kill.txt";
function log(m) { console.log(m); try { files.append(LOG, m + "\n"); } catch (e) {} }
try { files.write(LOG, ""); } catch (e) {}
var my = engines.myEngine();
var all = engines.all();
var n = 0;
for (var i = 0; i < all.length; i++) {
    if (all[i] !== my) { try { all[i].forceStop(); n++; } catch (e) {} }
}
log("已停止 " + n + " 个引擎, 剩余 " + engines.all().length);
