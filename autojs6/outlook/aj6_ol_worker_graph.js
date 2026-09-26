"ui";
// aj6_ol_worker_graph.js —— 专用"补 Graph 授权" worker
// 区别: AUTH URL 带 Graph+IMAP scope + prompt=consent + login_hint; 独立命令/回调文件(不碰批量的)
importClass(android.webkit.WebView);
importClass(android.webkit.CookieManager);

var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_worker_graph.txt";
var CMD = DIR + "/log/ol_cmd_graph.txt";
var CODE_FILE = DIR + "/log/ol_code_graph.txt";

function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }

var EMAIL = "__EMAIL__";
var AUTH = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize"
    + "?client_id=9e5f94bc-e8a4-4e73-b8be-63364c29d753"
    + "&response_type=code&redirect_uri=https%3A%2F%2Flocalhost"
    + "&scope=" + encodeURIComponent("https://graph.microsoft.com/Mail.Read https://outlook.office.com/IMAP.AccessAsUser.All offline_access")
    + "&prompt=consent&login_hint=" + encodeURIComponent(EMAIL);

ui.layout(<frame><webview id="wv" w="*" h="*" /></frame>);
var cm = CookieManager.getInstance();
try { cm.setAcceptCookie(true); } catch (e) {}
device.keepScreenOn();
try { device.wakeUp(); } catch (e) {}
try { cm.removeAllCookies(null); } catch (e) {}
ui.wv.getSettings().setJavaScriptEnabled(true);
ui.wv.getSettings().setDomStorageEnabled(true);
try { cm.setAcceptThirdPartyCookies(ui.wv, true); } catch (e) {}
ui.wv.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
    shouldOverrideUrlLoading: function (view, arg) {
        try {
            var u = "";
            try { u = String(arg.getUrl ? arg.getUrl().toString() : arg); } catch (e) { u = String(arg); }
            if (u.indexOf("code=") >= 0 && u.indexOf("localhost") >= 0) {
                try { files.write(CODE_FILE, u); } catch (e) {}
                log(">>> 捕获 Graph 授权回调");
                return true;
            }
        } catch (e) { log("ovr err " + e); }
        return false;
    },
    onPageFinished: function (v, url) { try { log("PAGE " + String(url).slice(0, 100)); } catch (e) {} }
}));
ui.wv.loadUrl(AUTH);
log("graph worker 启动(login_hint=" + EMAIL + ")");
threads.start(function () {
    var lastCmd = "", quitFlag = false;
    while (!quitFlag) {
        sleep(1500);
        try {
            if (files.exists(CMD)) {
                var c = String(files.read(CMD)).trim();
                if (c && c.indexOf("done:") !== 0 && c !== lastCmd) {
                    lastCmd = c;
                    var name = c.split(":")[0];
                    log("收到命令: " + c);
                    if (name === "auth") ui.run(function () { ui.wv.loadUrl(AUTH); });
                    else if (name === "reload") ui.run(function () { ui.wv.reload(); });
                    else if (name === "quit") { try { ui.run(function () { try { ui.finish(); } catch (e) {} }); } catch (e) {} quitFlag = true; }
                    try { files.write(CMD, "done:" + c); } catch (e) {}
                }
            }
        } catch (e) {}
    }
    log("graph worker 退出");
});
