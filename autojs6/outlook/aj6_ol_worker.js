"ui";
importClass(android.webkit.WebView);
importClass(android.webkit.CookieManager);
importClass(android.webkit.WebViewClient);

var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_worker.txt";
var CMD = DIR + "/log/ol_cmd.txt";
var CODE_FILE = DIR + "/log/ol_authcode.txt";

function ts() { return new Date().toTimeString().slice(0, 8); }
function log(m) { console.log(m); try { files.append(LOG, "[" + ts() + "] " + m + "\n"); } catch (e) {} }

var SIGNUP = "https://signup.live.com/signup?mkt=zh-CN";
var HEARTBEAT = DIR + "/log/ol_hb.txt";
var AUTH = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize"
    + "?client_id=9e5f94bc-e8a4-4e73-b8be-63364c29d753"
    + "&response_type=code&redirect_uri=https%3A%2F%2Flocalhost"
    + "&scope=https%3A%2F%2Foutlook.office.com%2FIMAP.AccessAsUser.All%20offline_access";

ui.layout(<frame><webview id="wv" w="*" h="*" /></frame>);
var cm = CookieManager.getInstance();
try { cm.setAcceptCookie(true); } catch (e) {}
device.keepScreenOn();
try { device.wakeUp(); } catch (e) {}
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
                log(">>> 捕获 OAuth 回调");
                return true;
            }
        } catch (e) { log("ovr err " + e); }
        return false;
    },
    onPageFinished: function (v, url) { try { log("PAGE " + String(url).slice(0, 90)); } catch (e) {} }
}));
ui.wv.loadUrl(SIGNUP);
log("worker 启动, 已加载注册页");
try { files.write(HEARTBEAT, String(Date.now())); } catch (e) {}

var lastCmd = "", quitFlag = false;
threads.start(function () {
    var beat = 0;
    while (!quitFlag) {
        sleep(1500);
        try {
            if (++beat % 3 === 0) { try { files.write(HEARTBEAT, String(Date.now())); } catch (e) {} }
            if (files.exists(CMD)) {
                var c = String(files.read(CMD)).trim();
                if (c && c.indexOf("done:") !== 0 && c !== lastCmd) {
                    lastCmd = c;
                    var name = c.split(":")[0];
                    log("收到命令: " + c);
                    if (name === "signup") ui.run(function () { ui.wv.loadUrl(SIGNUP); });
                    else if (name === "auth") ui.run(function () { ui.wv.loadUrl(AUTH); });
                    else if (name === "reload") ui.run(function () { ui.wv.reload(); });
                    else if (name === "quit") { try { ui.run(function () { try { ui.finish(); } catch (e) {} }); } catch (e) {} quitFlag = true; }
                    try { files.write(CMD, "done:" + c); } catch (e) {}
                }
            }
        } catch (e) {}
    }
    log("worker 退出");
});
