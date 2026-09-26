// signup_2thread.js — v4 双线程驱动：每格一个线程 + 互斥锁 + Cookie 上下文切换 + 批量轮
// 原理：同一进程 WebView 共享 Cookie 罐 → 每个窗格维护自己的 cookie 快照，
//       动作前 swap 进罐、下一动作换出（读 DOM 不换罐，只有触发网络的动作用）。
"ui";
importClass(android.webkit.ValueCallback);
importClass(android.webkit.CookieManager);

var GROK = "/storage/emulated/0/Hermes工作区/grok";
var LOG = GROK + "/log/signup_2thread.log";
var ACCOUNTS = GROK + "/grok_accounts.txt";
var SSO_OUT = GROK + "/sso_from_autojs.txt";
var CTRL = "http://127.0.0.1:8799";
var DUCK = "https://api.duckmail.sbs";
var SIGNUP_URL = "https://accounts.x.ai/sign-up?redirect=grok-com";
var URLS = ["https://accounts.x.ai/", "https://auth.x.ai/", "https://x.ai/", "https://grok.com/", "https://challenges.cloudflare.com/"];
var ROUNDS = 10;         // 批量轮数（每轮 2 个号）
var HOLD_OWNER = -1, HOLD_UNTIL = 0;   // 导航链持有者与到期时间（其他格在此期间不换罐）
function holdChain(p, ms) { HOLD_OWNER = p; HOLD_UNTIL = Date.now() + ms; }
function freeChain(p) { if (HOLD_OWNER === p) { HOLD_OWNER = -1; HOLD_UNTIL = 0; } }
var LOCK = new java.util.concurrent.locks.ReentrantLock();

function log(m) {
    var line = "[" + new Date().toTimeString().slice(0, 8) + "] " + m;
    console.log(line);
    try { files.append(LOG, line + "\n"); } catch (e) {}
}
function rnd(n) { var cs = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)]; return s; }
function rndName(n) { var up = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lo = "abcdefghijklmnopqrstuvwxyz"; var s = up[Math.floor(Math.random() * up.length)]; for (var i = 1; i < n; i++) s += lo[Math.floor(Math.random() * lo.length)]; return s; }

ui.layout(
    <vertical>
        <webview id="p1" layout_weight="1" />
        <webview id="p2" layout_weight="1" />
        <text id="dbg" text="2 窗格实验启动中…" textSize="11sp" textColor="#e6ffffff" bg="#cc101010" padding="6" w="*" h="auto" />
    </vertical>
);
var PANES = [ui.p1, ui.p2];
var cm = CookieManager.getInstance();
try { cm.setAcceptCookie(true); } catch (e) {}
device.keepScreenOn();
for (var pi = 0; pi < 2; pi++) { try { PANES[pi].getSettings().setJavaScriptEnabled(true); PANES[pi].getSettings().setDomStorageEnabled(true); } catch (e) {} }

// ---------- Cookie 快照/切换 ----------
var SNAPS = [{}, {}];
var lastSlot = -1;

function snapCookies() {
    var o = {};
    for (var i = 0; i < URLS.length; i++) {
        var raw = "";
        try { raw = String(cm.getCookie(URLS[i]) || ""); } catch (e) {}
        o[URLS[i]] = raw ? raw.split("; ") : [];
    }
    return o;
}
function restoreCookies(o) {
    var done = { v: false };
    try { cm.removeAllCookies(new JavaAdapter(ValueCallback, { onReceiveValue: function (v) { done.v = true; } })); } catch (e) { done.v = true; }
    var w0 = Date.now(); while (!done.v && Date.now() - w0 < 1500) sleep(60);
    for (var i = 0; i < URLS.length; i++) {
        var arr = o[URLS[i]] || [];
        for (var j = 0; j < arr.length; j++) { try { cm.setCookie(URLS[i], arr[j]); } catch (e) {} }
    }
    try { cm.flush(); } catch (e) {}
}
function swapTo(k) {
    if (lastSlot === k) return;
    if (lastSlot >= 0) SNAPS[lastSlot] = snapCookies();
    restoreCookies(SNAPS[k] || {});
    lastSlot = k;
}

// ---------- 窗格操作 ----------
function evalIn(pane, js, timeoutMs) {
    timeoutMs = timeoutMs || 7000;
    var got = { v: null, done: false };
    ui.run(function () {
        try {
            PANES[pane].evaluateJavascript(js, new JavaAdapter(ValueCallback, {
                onReceiveValue: function (val) { got.v = val; got.done = true; }
            }));
        } catch (e) { got.done = true; }
    });
    var w0 = Date.now();
    while (!got.done && Date.now() - w0 < timeoutMs) sleep(100);
    var v = got.v;
    if (typeof v === "string") { try { if (v.length >= 2 && v.charAt(0) === '"') v = JSON.parse(v); } catch (e) {} }
    return v;
}
function bodyText(pane) {
    return String(evalIn(pane, "(function(){try{return (document.body.innerText||'').slice(0,2200);}catch(e){return '';}})()") || "");
}
function inputInv(pane) {
    return String(evalIn(pane, "(function(){try{var ins=document.querySelectorAll('input');var out=[];for(var i=0;i<ins.length;i++){var r=ins[i].getBoundingClientRect();out.push((ins[i].type||'text')+'/'+(ins[i].placeholder||ins[i].name||'').slice(0,12)+'/vis'+(r.width>0?1:0));}return JSON.stringify(out);}catch(e){return 'E:'+e;}})()") || "");
}
var CLICK_JS = "(function(t){try{var els=document.querySelectorAll('button,[role=\"button\"],a,input[type=submit]');for(var i=0;i<els.length;i++){var x=(els[i].innerText||els[i].value||'').trim();var m=false;for(var j=0;j<t.length;j++){if(x===t[j]){m=true;break;}}if(!m)continue;try{var f=els[i].form;if(f){var a=f.querySelector('input[name=\"action\"]');if(a&&!a.value)a.value='allow';}}catch(e){}els[i].click();return 'CLICKED:'+x;}return 'NOBTN';}catch(e){return 'E:'+e;}})(";
function clickIn(pane, list, doSwap) {
    LOCK.lock();
    try {
        while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
        if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
        swapTo(pane);
        var r = String(evalIn(pane, CLICK_JS + JSON.stringify(list) + ")"));
        if (r.indexOf("CLICKED") === 0 && HOLD_OWNER < 0) holdChain(pane, 1500);
        return r;
    } finally { LOCK.unlock(); }
}
function loadIn(pane, url) {
    LOCK.lock();
    try {
        while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
        if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
        swapTo(pane);
        ui.run(function () { PANES[pane].loadUrl(url); });
        sleep(120);
    } finally { LOCK.unlock(); }
}
function tsTokenLen(pane) {
    var raw = evalIn(pane, "(function(){try{var e=document.querySelector('input[name=\"cf-turnstile-response\"]');return e&&e.value?String(e.value.length):'0';}catch(e){return '0';}})()");
    return parseInt(raw || "0", 10) || 0;
}
// ---- 验证真人超时/失败态：出现「请验证您是真人」勾选框（className=CheckBox）时必须点击（execute 无效）----
// 注：双窗格下不区分窗格，点中哪格的框都算好事（两格各自的线程都会尝试）
function tsClickBox(label) {
    try {
        var el = null;
        try { el = desc("请验证您是真人").className("CheckBox").findOne(500); } catch (e) {}
        if (!el) { try { el = className("CheckBox").descContains("请验证").findOne(200); } catch (e) {} }
        if (!el) { try { el = descContains("请验证您是真人").findOne(200); } catch (e) {} }
        if (!el) { try { el = descContains("Verify you are human").findOne(200); } catch (e) {} }
        if (el) {
            var b = null;
            try { b = el.bounds(); } catch (e2) {}
            var ok = false;
            // 真实触摸优先：Turnstile 勾选框在 iframe 里，合成 el.click() 经常点不中
            if (b && b.width() > 0 && b.height() > 0) {
                try { press(b.centerX(), b.centerY(), 120); ok = true; } catch (e3) {}
                log((label || "") + " 勾选框[请验证您是真人]: PRESS@" + b.centerX() + "," + b.centerY() + (ok ? "" : " 失败"));
            }
            if (!ok) {
                try { ok = el.click(); } catch (e4) {}
                log((label || "") + " 勾选框[请验证您是真人]: " + (ok ? "CLICKED" : "FOUND_但点击失败"));
            }
            return true;
        }
    } catch (e) { log((label || "") + " 勾选框异常: " + e); }
    return false;
}
function tsRefreshLite(pane) {
    LOCK.lock();
    try {
    while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
    if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
    var r = evalIn(pane, "(function(){try{var inp=document.querySelector('input[name=\"cf-turnstile-response\"]');if(inp)inp.value='';var w=document.querySelector('.cf-turnstile')||document.querySelector('[data-sitekey]');if(window.turnstile&&window.turnstile.reset){try{window.turnstile.reset(w||null);}catch(e){}}if(window.turnstile&&window.turnstile.execute){if(w){window.turnstile.execute(w);}else{window.turnstile.execute();}return 'RESET_EXEC';}return 'NO_API';}catch(e){return 'ERR:'+e;}})()");
    log("  [挂" + (pane + 1) + "] tsRefresh: " + r);
    return r;
    } finally { LOCK.unlock(); }
}
function getSsoFor(pane) {
    LOCK.lock();
    try {
    while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
    if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
    swapTo(pane);
    for (var i = 0; i < 3; i++) {
        var c = null;
        try { c = cm.getCookie(["https://grok.com", "https://accounts.x.ai", "https://x.ai"][i]); } catch (e) {}
        if (c) { var m = c.match(/(?:^|;\s*)sso=([^;]+)/); if (m) return m[1]; }
    }
    return null;
    } finally { LOCK.unlock(); }
}

// ---------- DuckMail ----------
// ---- 邮箱域名自动轮换（x.ai 会拉黑一次性邮箱域名，被拒就换下一个）----
var DOMAINS = ["duckmail.sbs", "hubaiclass.org", "markstonehub.org", "glasswhitehub.com", "stoneground.shop", "lakeground.shop", "canvaspace.shop", "vercelspace.shop", "seedancespace.shop", "happyhorsespace.shop", "bananaspace.shop", "sunstarmoon.shop", "moonstarsun.shop", "sunmoonlight.shop", "makesomestone.shop", "mikesomelike.shop", "somestoneair.shop", "markaihub.shop", "niceground.shop"];
var DOM_IDX = 0;
function curDomain() { return DOMAINS[DOM_IDX % DOMAINS.length]; }

function duckToken(email, mailPw) {
    try { http.postJson(DUCK + "/accounts", { address: email, password: mailPw, expiresIn: 0 }, {}); } catch (e) {}
    var tok = http.postJson(DUCK + "/token", { address: email, password: mailPw }, {});
    if (tok.statusCode >= 300) throw new Error("DuckMail token HTTP " + tok.statusCode);
    return JSON.parse(tok.body.string()).token;
}
function duckCodeOnce(jwt) {
    try {
        var r = http.get(DUCK + "/messages", { headers: { Authorization: "Bearer " + jwt, Accept: "application/json" } });
        var arr = JSON.parse(r.body.string())["hydra:member"] || [];
        for (var i = 0; i < arr.length; i++) {
            var txt = (arr[i].subject || "") + " " + (arr[i].intro || "");
            var m = txt.match(/\b([A-Z0-9]{3}-[A-Z0-9]{3})\b/);
            if (!m && arr[i].id) {
                var d = http.get(DUCK + "/messages/" + arr[i].id, { headers: { Authorization: "Bearer " + jwt, Accept: "application/json" } });
                var dj = JSON.parse(d.body.string());
                m = ((dj.subject || "") + " " + (dj.text || "")).match(/\b([A-Z0-9]{3}-[A-Z0-9]{3})\b/);
            }
            if (m) return m[1];
        }
    } catch (e) {}
    return null;
}

// ---------- 表单 ----------
function fillEmail(pane, v) {
    LOCK.lock();
    try {
    while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
    if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
    return evalIn(pane, "(function(){try{var em=document.querySelector('input[type=email]')||document.querySelector('input[name=email]');if(!em)return 'NOEMAIL';var d=Object.getOwnPropertyDescriptor(em.__proto__,'value');d.set.call(em,'" + v + "');em.dispatchEvent(new Event('input',{bubbles:true}));return 'EMAIL_OK';}catch(e){return 'E:'+e;}})()");
    } finally { LOCK.unlock(); }
}
function fillCode(pane, code) {
    LOCK.lock();
    try {
    while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
    if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
    var flat = code.replace(/-/g, "");
    return evalIn(pane, "(function(code){try{var ins=document.querySelectorAll('input');var vis=[];for(var i=0;i<ins.length;i++){var t=(ins[i].type||'').toLowerCase();if(t==='email'||t==='password'||t==='hidden'||t==='checkbox')continue;var r=ins[i].getBoundingClientRect();if(r.width<=0||r.height<=0)continue;vis.push(ins[i]);}if(vis.length===0)return 'NOBOX';var d;var one=vis.filter(function(e){return String(e.maxLength)==='1'||e.getAttribute('maxlength')==='1';});if(one.length>=4){for(var k=0;k<one.length&&k<code.length;k++){d=Object.getOwnPropertyDescriptor(one[k].__proto__,'value');d.set.call(one[k],code.charAt(k));one[k].dispatchEvent(new Event('input',{bubbles:true}));}return 'FILLED_BOXES_'+one.length;}d=Object.getOwnPropertyDescriptor(vis[0].__proto__,'value');d.set.call(vis[0],code);vis[0].dispatchEvent(new Event('input',{bubbles:true}));return 'FILLED_ONE';}catch(e){return 'E:'+e;}})('" + flat + "')");
    } finally { LOCK.unlock(); }
}
function fillProfile(pane, given, family, pass) {
    LOCK.lock();
    try {
    while (HOLD_OWNER >= 0 && HOLD_OWNER !== pane && Date.now() < HOLD_UNTIL) sleep(60);
    if (Date.now() >= HOLD_UNTIL) { HOLD_OWNER = -1; }
    return evalIn(pane, "(function(g,f,p){try{var ins=document.querySelectorAll('input');var txts=[],pws=[];for(var i=0;i<ins.length;i++){var t=(ins[i].type||'text').toLowerCase();var r=ins[i].getBoundingClientRect();if(r.width<=0||r.height<=0)continue;if(t==='password')pws.push(ins[i]);else if(t==='text'||t==='')txts.push(ins[i]);}var d=function(el,v){var dd=Object.getOwnPropertyDescriptor(el.__proto__,'value');dd.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};if(txts.length>0)d(txts[0],g);if(txts.length>1)d(txts[1],f);for(var k=0;k<pws.length;k++)d(pws[k],p);return 'T'+txts.length+'_P'+pws.length;}catch(e){return 'E:'+e;}})('" + given + "','" + family + "','" + pass + "')");
    } finally { LOCK.unlock(); }
}

// ---------- 每个窗格的槽位状态机 ----------
// 0 INIT 1 LOAD 2 FILL_EMAIL 3 SUBMIT_EMAIL 4 CODE_WAIT 5 CODE_SUBMIT 6 PROFILE 7 FINISH 8 SSO_SAVED 9 OAUTH_DEVICE 10 OAUTH_CONSENT 11 OAUTH_DONE 12 DONE 99 FAIL
function newSlot(pane) {
    var s = {
        pane: pane, st: 0, email: "", mailPw: rnd(14), password: "N" + rnd(8) + "!a7#" + rnd(10),
        given: rndName(5), family: rndName(6), jwt: "", code: "", sso: "",
        oauthState: "", nextPoll: 0, clicks: 0, tries: 0, note: ""
    };
    s.email = rnd(10) + "@" + curDomain();
    return s;
}
var SLOTS = [newSlot(0), newSlot(1)];
var STATES = ["INIT", "LOAD", "填邮箱", "交邮箱", "等验证码", "交验证码", "填资料", "完成注册", "存sso", "设备码", "点允许", "等token", "完成", "失败"];

function stepSlot(s) {
    var p = s.pane;
    switch (s.st) {
        case 0:
            s.jwt = duckToken(s.email, s.mailPw);
            log("[挂" + (p + 1) + "] 建箱 OK: " + s.email);
            loadIn(p, SIGNUP_URL);
            s.st = 1; s.tries = 0;
            break;
        case 1:
            s.tries++;
            if (evalIn(p, "String(document.readyState)") === "complete") {
                var inv = inputInv(p);
                if (inv.indexOf("email") >= 0) { s.st = 2; break; }
                if (s.tries % 2 === 0 && s.clicks < 4) { s.clicks++; clickIn(p, ["使用邮箱注册", "Sign up with email", "邮箱注册"]); }
                if (s.tries > 50) { s.st = 99; s.note = "表单未出现"; }
            } else if (s.tries > 60) { s.st = 99; s.note = "页面加载超时"; }
            break;
        case 2:
            log("[挂" + (p + 1) + "] 填邮箱: " + fillEmail(p, s.email));
            s.st = 3; s.tries = 0; s.clicks = 0;
            break;
        case 3:
            s.tries++;
            if (s.clicks < 6 && (s.tries === 1 || s.tries % 4 === 0)) { s.clicks++; clickIn(p, ["注册", "Sign up", "Continue", "继续"]); }
            var inv3 = inputInv(p), bt3 = bodyText(p);
            if (inv3.indexOf("email") < 0 || /验证您的邮箱|输入验证码|Enter the code|验证码/i.test(bt3)) { s.st = 4; s.nextPoll = 0; }
            else if (/non-disposable|disposable email|一次性邮箱|临时邮箱/i.test(bt3)) { DOM_IDX++; log("[挂" + (p + 1) + "] 域名被拒 → 换 " + curDomain()); s.st = 99; s.note = "域名被拒,已换域名"; } else if (s.tries > 50) { s.st = 99; s.note = "邮箱提交失败"; }
            break;
        case 4:
            if (Date.now() >= s.nextPoll) {
                s.nextPoll = Date.now() + 2500;
                s.mailPolls = (s.mailPolls || 0) + 1;
                var code = duckCodeOnce(s.jwt);
                if (code) {
                    log("[挂" + (p + 1) + "] 收到验证码(" + code.length + ")");
                    fillCode(p, code);
                    s.st = 5; s.tries = 0; s.clicks = 0;
                } else if (s.mailPolls > 100) { s.st = 99; s.note = "验证码超时"; }
            }
            break;
        case 5:
            s.tries++;
            if (inputInv(p).indexOf("password") >= 0) { s.st = 6; break; }          // 六码填完常自动提交
            if (s.tries % 6 === 0 && s.clicks < 4) { s.clicks++; clickIn(p, ["确认邮箱", "确认", "验证", "Continue", "Verify"]); }
            if (s.tries > 60) { s.st = 99; s.note = "验证码页卡住"; }
            break;
        case 6:
            log("[挂" + (p + 1) + "] 填资料: " + fillProfile(p, s.given, s.family, s.password));
            s.st = 7; s.tries = 0; s.clicks = 0; s.tsTried = false;
            break;
        case 7:
            s.sso = getSsoFor(p);
            if (s.sso) {
                freeChain(p);   // 注册链已走完，放行另一格
                files.append(SSO_OUT, s.email + "----" + s.sso + "\n");
                log("[挂" + (p + 1) + "] sso 到手(" + s.sso.length + ")");
                try {
                    var res = http.get(CTRL + "/new?email=" + encodeURIComponent(s.email));
                    var d = JSON.parse(res.body.string());
                    s.oauthState = d.state;
                    s.devUrl = d.url;
                    loadIn(p, d.url);
                    log("[挂" + (p + 1) + "] 打开设备码页");
                    s.st = 9;
                } catch (e) { log("[挂" + (p + 1) + "] 控制服务失败: " + e); freeChain(p); s.st = 12; }
                break;
            }
            var tl = tsTokenLen(p);
            if (tl <= 0 && !s.tsTried) { s.tsTried = true; s.tsT = 0; if (!tsClickBox("挂" + (p + 1))) tsRefreshLite(p); }
            if (tl <= 0) {
                s.tsT = (s.tsT || 0) + 1;
                if (s.tsT % 3 === 2) tsClickBox("挂" + (p + 1));
                if (s.tsT > 20) { s.st = 99; s.note = "token 出不来"; }
                break;
            }
            s.tries++;
            if (s.tries === 1 || s.tries % 4 === 0) { var rc7 = clickIn(p, ["完成注册", "Create account", "Finish", "提交"]); if (rc7.indexOf("CLICKED") === 0) holdChain(p, 15000); }
            if (/Something went wrong|出错了/i.test(bodyText(p))) { s.errStreak = (s.errStreak || 0) + 1; tsRefreshLite(p); if (s.errStreak >= 4) { s.st = 99; s.note = "提交被拒"; } }
            if (s.tries > 60) { s.st = 99; s.note = "完成注册无进展"; }
            break;
        case 9:
            s.tries++;
            var bt9 = bodyText(p);
            if (/允许/.test(bt9)) { freeChain(p); s.st = 10; s.tries = 0; break; }
            if (s.tries === 1 || s.tries % 5 === 0) { var r9 = clickIn(p, ["继续", "Continue", "确认", "下一步", "知道了", "Got it"]); if (r9.indexOf("CLICKED") === 0) holdChain(p, 5000); log("[挂" + (p + 1) + "] 点继续: " + r9); }
            var href9 = String(evalIn(p, "String(location.href)"));
            if (href9.indexOf("/sign-in") >= 0 && s.tries % 5 === 0) {
                s.reloads = (s.reloads || 0);
                if (s.reloads < 3) { s.reloads++; log("[挂" + (p + 1) + "] 被弹回登录页，重开设备码页(" + s.reloads + ")"); loadIn(p, s.devUrl); }
            }
            if (s.tries > 90) { freeChain(p); s.st = 99; s.note = "设备码页卡住"; }
            break;
        case 10:
            s.tries++;
            var href10 = String(evalIn(p, "String(location.href)"));
            var bt10 = bodyText(p);
            if (href10.indexOf("device/done") >= 0 || /设备已授权|已获授权|可以关闭此窗口/i.test(bt10)) { freeChain(p); s.st = 11; s.tries = 0; break; }
            if (/Invalid action/i.test(bt10)) { freeChain(p); s.st = 99; s.note = "Invalid action"; break; }
            // 服务端真相优先：即使页面被弹到登录页，approve 也可能已经处理、token 已落盘
            if (s.tries % 3 === 0) {
                try {
                    var stx = JSON.parse(http.get(CTRL + "/status?state=" + s.oauthState).body.string());
                    if (stx.done && stx.ok) {
                        log("[挂" + (p + 1) + "] token 已保存 ✓（页面状态无关）" + (stx.token_file || ""));
                        files.append(ACCOUNTS, s.email + "----" + s.mailPw + "----" + s.password + "----" + s.given + " " + s.family + "----OK-" + new Date().toISOString() + "\n");
                        freeChain(p);
                        s.st = 12; break;
                    }
                } catch (e) {}
            }
            if (href10.indexOf("/sign-in") >= 0 && s.tries % 6 === 0) {
                s.reloads2 = (s.reloads2 || 0);
                if (s.reloads2 < 3) { s.reloads2++; log("[挂" + (p + 1) + "] 允许页被弹回登录，重开设备码页(" + s.reloads2 + ")"); loadIn(p, s.devUrl); }
            }
            if (s.tries === 1 || s.tries % 6 === 0) { var cr = clickIn(p, ["允许", "Allow", "同意", "Authorize", "知道了", "Got it"]); if (cr.indexOf("CLICKED") === 0) holdChain(p, 8000); log("[挂" + (p + 1) + "] 点允许: " + cr + " | " + href10.slice(-46)); }
            if (s.tries > 90) { freeChain(p); s.st = 99; s.note = "允许页卡住"; }
            break;
        case 11:
            try {
                var st11 = JSON.parse(http.get(CTRL + "/status?state=" + s.oauthState).body.string());
                if (st11.done) {
                    if (st11.ok) {
                        log("[挂" + (p + 1) + "] token 已保存 ✓ " + (st11.token_file || ""));
                        files.append(ACCOUNTS, s.email + "----" + s.mailPw + "----" + s.password + "----" + s.given + " " + s.family + "----OK-" + new Date().toISOString() + "\n");
                        freeChain(p);
                        s.st = 12;
                    } else { freeChain(p); s.note = "oauth失败"; s.st = 99; }
                }
            } catch (e) {}
            s.tries++;
            if (s.tries > 90) { s.note = "token超时"; s.st = 99; }
            break;
        default:
            break;
    }
}

// ---------- 双线程驱动（每格一个线程 + 互斥锁 + 批量轮） ----------
function stName(s) { return s.st === 99 ? "失败" : STATES[s.st]; }
function clearJar() {
    var done = { v: false };
    try { cm.removeAllCookies(new JavaAdapter(ValueCallback, { onReceiveValue: function (v) { done.v = true; } })); } catch (e) { done.v = true; }
    var w0 = Date.now(); while (!done.v && Date.now() - w0 < 1500) sleep(60);
    try { cm.flush(); } catch (e) {}
    lastSlot = -1;
    SNAPS[0] = {}; SNAPS[1] = {};
}
var lastDbg = 0;
function updateDbg() {
    if (Date.now() - lastDbg < 800) return;
    lastDbg = Date.now();
    var msg = "A:" + stName(SLOTS[0]) + "(" + SLOTS[0].tries + ")  B:" + stName(SLOTS[1]) + "(" + SLOTS[1].tries + ") 轮" + ROUNDS;
    ui.run(function () { if (ui.dbg) ui.dbg.setText(msg); });
}
function slotLoop(s, delay) {
    if (delay) sleep(delay);
    while (s.st !== 12 && s.st !== 99) {
        try { stepSlot(s); } catch (e) { log("[挂" + (s.pane + 1) + "] 异常: " + e); s.tries = (s.tries || 0) + 10; }
        updateDbg();
        sleep(400);
    }
    updateDbg();
}

threads.start(function () {
    try {
        log("=== 双线程双窗格 v4 开始，共 " + ROUNDS + " 轮（每轮 2 号）===");
        for (var r = 1; r <= ROUNDS; r++) {
            var rt0 = Date.now();
            log("---- 第 " + r + "/" + ROUNDS + " 轮 ----");
            SLOTS = [newSlot(0), newSlot(1)];
            LOCK.lock(); try { clearJar(); } finally { LOCK.unlock(); }
            var s0 = SLOTS[0], s1 = SLOTS[1];
            threads.start(function () { slotLoop(s0, 0); });
            threads.start(function () { slotLoop(s1, 7000); });
            // 轮询等待两格结束（AutoJs6 的 Thread.join 不可靠）
            var wt0 = Date.now();
            while ((s0.st !== 12 && s0.st !== 99) || (s1.st !== 12 && s1.st !== 99)) {
                if (Date.now() - wt0 > 360000) { log("!! 本轮超时 6 分钟，强制进入下一轮"); break; }
                sleep(250);
            }
            log("第 " + r + " 轮结果: A=" + stName(s0) + (s0.note ? "(" + s0.note + ")" : "") + " | B=" + stName(s1) + (s1.note ? "(" + s1.note + ")" : "") + " | 用时 " + Math.round((Date.now() - rt0) / 1000) + "s");
            sleep(1500);
        }
        log("=== 全部完成（" + ROUNDS + " 轮）===");
        sleep(2000);
        ui.run(function () { try { ui.finish(); } catch (e) {} });
        sleep(500);
        exit();
    } catch (e) {
        log("EXCEPTION: " + e);
    }
});
