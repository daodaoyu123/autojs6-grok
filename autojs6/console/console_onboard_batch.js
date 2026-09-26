// Console 批量入职：遍历 sso 池，给每个号建 Console 团队（已入职的自动跳过）
"ui";
importClass(android.webkit.WebView);
importClass(android.webkit.CookieManager);
importClass(android.webkit.WebViewClient);
importClass(android.webkit.ValueCallback);

var SSO_FILE = "/storage/emulated/0/Hermes工作区/grok/sso_from_autojs.txt";
var OUT = "/storage/emulated/0/Hermes工作区/grok/log/console_onboard_batch.log";
var START = parseInt(String(readConfig("start", "0")), 10); // 从第几个开始（断点续跑用，默认 0）
function readConfig(k, d) { try { var v = String(files.read("/storage/emulated/0/Hermes工作区/grok/log/onboard_progress.txt") || ""); var m = v.match(new RegExp(k + "=(\\d+)")); return m ? m[1] : d; } catch (e) { return d; } }
function log(m) { try { files.append(OUT, "[" + new Date().toTimeString().slice(0, 8) + "] " + m + "\n"); } catch (e) {} console.log(m); }

ui.layout(
    <vertical>
        <webview id="wv" layout_weight="1" />
        <text id="dbg" text="批量入职…" textSize="11sp" textColor="#e6ffffff" bg="#cc101010" padding="6" w="*" h="auto" />
    </vertical>
);

threads.start(function () {
    var cm = CookieManager.getInstance();
    try { cm.setAcceptCookie(true); } catch (e) {}
    ui.run(function () {
        ui.wv.getSettings().setJavaScriptEnabled(true);
        ui.wv.getSettings().setDomStorageEnabled(true);
        ui.wv.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
            onPageFinished: function (view, url) {}
        }));
    });
    sleep(600);
    try { device.wakeUp(); } catch (e) {}
    try { device.keepScreenOn(); } catch (e) {}
    log("(已尝试唤醒并保持常亮)");

    var lines = String(files.read(SSO_FILE) || "").split("\n");
    var list = [];
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l.indexOf("----") > 0) {
            var p = l.split("----");
            if (p[1] && p[1].length > 50) list.push({ email: p[0], sso: p[1] });
        }
    }
    log("=== 批量入职开始，共 " + list.length + " 个账号（从 " + START + " 开始）===");

    function js(expr, t) {
        var got = { v: null, done: false };
        ui.run(function () {
            try { ui.wv.evaluateJavascript(expr, new JavaAdapter(ValueCallback, { onReceiveValue: function (val) { got.v = val; got.done = true; } })); } catch (e) { got.done = true; }
        });
        var w0 = Date.now(); t = t || 7000;
        while (!got.done && Date.now() - w0 < t) sleep(120);
        var v = got.v;
        if (typeof v === "string") { try { if (v.length >= 2 && v.charAt(0) === '"') v = JSON.parse(v); } catch (e) {} }
        return v;
    }
    function waitReady(ms) {
        var w0 = Date.now();
        while (Date.now() - w0 < ms) {
            if (String(js("String(document.readyState)") || "") === "complete") return true;
            sleep(300);
        }
        return false;
    }
    var CLICK = "(function(t){try{var els=document.querySelectorAll('button,[role=\\\"button\\\"],a,input[type=submit],label,li,span');for(var i=0;i<els.length;i++){var x=(els[i].innerText||els[i].value||'').trim();if(x.length>22)continue;for(var j=0;j<t.length;j++){if(x===t[j]){els[i].click();return 'CLICKED:'+x;}}}return 'NOBTN';}catch(e){return 'E:'+e;}})(";
    function clickText(list2) { return String(js(CLICK + JSON.stringify(list2) + ")") || ""); }
    function fillTeam(v) {
        return String(js("(function(){try{var em=document.querySelector('input[type=text]')||document.querySelector('input:not([type])')||document.querySelector('input');if(!em)return 'NOINPUT';var d=Object.getOwnPropertyDescriptor(em.__proto__,'value');d.set.call(em,'" + v + "');em.dispatchEvent(new Event('input',{bubbles:true}));return 'FILLED';}catch(e){return 'E:'+e;}})()") || "");
    }

    var okN = 0, doneN = 0, failN = 0;
    var blankFailStreak = 0;
    var failedEmails = [];
    for (var i = START; i < list.length; i++) {
        var acc = list[i];
        try {
            if (i === START) log("--- 跳过无效行检查完，开始 ---");
            for (var u = 0; u < 4; u++) { /* 清掉上一个号的 sso 值再写入本号 */
                var urls = ["https://console.x.ai/", "https://accounts.x.ai/", "https://x.ai/", "https://grok.com/"];
                for (var k = 0; k < urls.length; k++) {
                    try { cm.setCookie(urls[k], "sso=; Max-Age=0"); cm.setCookie(urls[k], "sso-rw=; Max-Age=0"); } catch (e) {}
                }
                break;
            }
            var urls2 = ["https://console.x.ai/", "https://accounts.x.ai/", "https://x.ai/", "https://grok.com/"];
            for (var k2 = 0; k2 < urls2.length; k2++) {
                try { cm.setCookie(urls2[k2], "sso=" + acc.sso); cm.setCookie(urls2[k2], "sso-rw=" + acc.sso); } catch (e) {}
            }
            try { cm.flush(); } catch (e) {}

            log("[" + (i + 1) + "/" + list.length + "] " + acc.email);
            ui.run(function () { if (ui.dbg) ui.dbg.setText("[" + (i + 1) + "/" + list.length + "] " + acc.email); });
            ui.run(function () { ui.wv.loadUrl("https://console.x.ai/welcome"); });
            waitReady(12000);
            sleep(1800);

            var joined = false, skip = false, blank = 0;
            for (var a = 0; a < 12; a++) {
                var href = String(js("String(location.href)") || "");
                var txt = String(js("String(document.body&&document.body.innerText||'').slice(0,900)") || "");
                if (href.indexOf("/team/") >= 0) { joined = true; if (a === 0) skip = true; break; }
                if (/All set, here is your API key|See what you can build|Purchase your first credits/i.test(txt)) {
                    var cK = clickText(["Close", "关闭", "Go to console", "Go to dashboard", "Continue", "继续", "Got it", "知道了", "Done", "完成", "Get started", "Skip", "跳过"]);
                    sleep(1500);
                    var h2 = String(js("String(location.href)") || "");
                    joined = true;
                    log("  收尾页(已建团队+计划): " + cK + " | /team=" + (h2.indexOf("/team/") >= 0));
                    break;
                }
                if (href && txt) blank = 0;
                else { blank++; if (blank >= 3) { ui.run(function () { ui.wv.loadUrl("https://console.x.ai/welcome"); }); waitReady(10000); sleep(1500); blank = 0; } }
                if (/Create your team|Team name|Give your team a name/i.test(txt)) {
                    var f = fillTeam("Team" + Math.floor(Math.random() * 90000 + 10000));
                    sleep(500);
                    clickText(["Hobbyist", "爱好者", "Engineer", "Student"]);
                    sleep(500);
                    var cc = clickText(["Continue", "继续"]);
                    log("  建团队: " + f + " / " + cc);
                } else if (/Choose your plan|Choose your starting point|starting point|Choose a plan/i.test(txt)) {
                    var cA = clickText(["Explore", "探索", "Free", "免费"]);
                    sleep(600);
                    var cB = clickText(["Continue for free", "免费继续", "Continue", "继续", "Start building"]);
                    log("  选计划: " + cA + " / " + cB);
                } else {
                    var c3 = clickText(["Close", "关闭", "Continue", "继续", "Skip", "跳过", "Get started", "开始使用", "Done", "完成"]);
                    if (a < 2) log("  其他页: " + href.slice(0, 60) + " | 点: " + c3 + " | " + txt.slice(0, 100).replace(/\n+/g, " "));
                }
                sleep(1700);
            }
            if (skip) { doneN++; blankFailStreak = 0; log("  ✓ 已在控制台（跳过）"); }
            else if (joined) { okN++; blankFailStreak = 0; log("  ✓ 入职完成"); }
            else {
                failN++; failedEmails.push(acc.email);
                var finalHref = String(js("String(location.href)") || "");
                if (!finalHref) blankFailStreak++; else blankFailStreak = 0;
                log("  ✗ 未完成: href=" + finalHref.slice(0, 80) + " | " + String(js("String(document.body&&document.body.innerText||'').slice(0,150)") || "").replace(/\n+/g, " "));
                if (blankFailStreak >= 2) {
                    log("!!! 连续 " + blankFailStreak + " 个账号页面全空白（WebView 无法加载）→ 中止本批。");
                    log("!!! 处理办法：完全关闭并重新打开 AutoJs6（或重启手机）后再跑。");
                    break;
                }
            }
            try { files.write("/storage/emulated/0/Hermes工作区/grok/log/onboard_progress.txt", "last=" + i + "\n"); } catch (e) {}
            // (保持前台运行，避免后台 WebView 加载失败)
        } catch (e) {
            failN++; failedEmails.push(acc.email);
            log("  ✗ 异常: " + e);
        }
    }
    log("=== 批量入职结束: 新完成 " + okN + " / 已跳过 " + doneN + " / 失败 " + failN + " ===");
    if (failedEmails.length) log("失败名单: " + failedEmails.join(", "));
    sleep(1000);
    ui.run(function () { try { ui.finish(); } catch (e) {} });
    sleep(400);
    exit();
});
