// grok_signup_webview.js v3 — AutoJs6 WebView 一步到位：注册 + 抓 sso + 抓 OAuth token + 清场循环
// v3 要点：一切点击 = 获取控件 + element.click()（零坐标触摸）；提交按钮自动补 hidden action=allow/deny；
//   各阶段等待时间压缩；成功硬判据 = 拿到 sso cookie。
"ui";
importClass(android.webkit.WebView);
importClass(android.webkit.CookieManager);
importClass(android.webkit.WebViewClient);
importClass(android.webkit.ValueCallback);

var ROUNDS = 1;
var FIXED_EMAIL = "__EMAIL__";
var RUNID = String(Date.now());
var GROK = "/storage/emulated/0/Hermes工作区/grok";
var LOG = GROK + "/log/grok_signup_webview.log";
var ACCOUNTS = GROK + "/grok_accounts.txt";
var SSO_OUT = GROK + "/sso_from_autojs.txt";
var DUCK = "https://api.duckmail.sbs";
var CTRL = "http://127.0.0.1:8799";
var SIGNUP_URL = "https://accounts.x.ai/sign-up?redirect=grok-com";
var T0 = Date.now();

function log(m) {
    var t = ((Date.now() - T0) / 1000).toFixed(1);
    var line = "[" + t + "s] " + m;
    console.log(line);
    try { files.append(LOG, "[" + new Date().toTimeString().slice(0, 8) + " +" + t + "s] " + m + "\n"); } catch (e) {}
    _dbg.push(line);
    if (_dbg.length > 7) _dbg.shift();
    try { ui.run(function () { if (ui.dbg) ui.dbg.setText(_dbg.join("\n")); }); } catch (e) {}
}
function rnd(n) { var cs = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < n; i++) s += cs[Math.floor(Math.random() * cs.length)]; return s; }
function rndName(n) { var up = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", lo = "abcdefghijklmnopqrstuvwxyz"; var s = up[Math.floor(Math.random() * up.length)]; for (var i = 1; i < n; i++) s += lo[Math.floor(Math.random() * lo.length)]; return s; }

ui.layout(
    <frame>
        <webview id="wv" />
        <text id="dbg" text="[调试窗口] 等待启动…" textSize="11sp" textColor="#e6ffffff" bg="#cc101010"
              padding="8" w="*" h="auto" layout_gravity="bottom" />
    </frame>
);
var _dbg = [];
var cm = CookieManager.getInstance();
try { cm.setAcceptCookie(true); } catch (e) {}
device.keepScreenOn();
ui.wv.getSettings().setJavaScriptEnabled(true);
ui.wv.getSettings().setDomStorageEnabled(true);
try { cm.setAcceptThirdPartyCookies(ui.wv, true); } catch (e) {}
ui.wv.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
    onPageFinished: function (v, url) { log("页面完成: " + url); }
}));
var WV = [0, 0];
var DPR = 1;

function runJs(script, cb) {
    ui.run(function () {
        try {
            ui.wv.evaluateJavascript(script, new JavaAdapter(ValueCallback, {
                onReceiveValue: function (val) { try { cb(val); } catch (e) { log("回调异常: " + e); } }
            }));
        } catch (e) { log("evaluate 异常: " + e); cb("null"); }
    });
}
function runJsSync(script, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var got = { v: null, done: false };
    runJs(script, function (val) { got.v = val; got.done = true; });
    var w0 = Date.now();
    while (!got.done && Date.now() - w0 < timeoutMs) { sleep(120); }
    var v = got.v;
    if (typeof v === "string") {
        try { if (v.length >= 2 && v.charAt(0) === '"') v = JSON.parse(v); } catch (e) {}
    }
    return v;
}
function bodyText() {
    return String(runJsSync("(function(){try{return (document.body.innerText||'').slice(0,2500);}catch(e){return '';}})()") || "");
}
function inputInv() {
    return String(runJsSync("(function(){try{var ins=document.querySelectorAll('input');var out=[];for(var i=0;i<ins.length;i++){var r=ins[i].getBoundingClientRect();out.push((ins[i].type||'text')+'/'+(ins[i].placeholder||ins[i].name||'').slice(0,12)+'/vis'+(r.width>0?1:0));}return JSON.stringify(out);}catch(e){return 'E:'+e;}})()") || "");
}
function waitJs(expr, maxMs, step) {
    // 主动轮询 JS 条件：一满足立即返回（替代固定 sleep 长等）
    var w0 = Date.now();
    while (Date.now() - w0 < (maxMs || 5000)) {
        if (String(runJsSync("(function(){try{return (" + expr + ")?'Y':'N';}catch(e){return 'N';}})()")) === "Y") return true;
        sleep(step || 300);
    }
    return false;
}
function jsClickByText(list, label) {
    var js = "(function(t){var els=document.querySelectorAll('button,[role=\"button\"],a');for(var i=0;i<els.length;i++){var x=(els[i].innerText||'').trim();for(var j=0;j<t.length;j++){if(x===t[j]){els[i].click();return 'CLICKED';}}}return 'NOBTN';})(" + JSON.stringify(list) + ")";
    var r = runJsSync(js);
    log((label || "") + " JS点击: " + r);
    return r === "CLICKED";
}
function pressByText(list, label) {
    // v4 全控件点击（零坐标）：定位元素 → 提交按钮若 hidden action 为空则补 allow（一行，零耗时）→ element.click()
    var js = "(function(t){try{var els=document.querySelectorAll('button,[role=\"button\"],a,input[type=submit]');for(var i=0;i<els.length;i++){var x=(els[i].innerText||els[i].value||'').trim();var m=false;for(var j=0;j<t.length;j++){if(x===t[j]){m=true;break;}}if(!m)continue;try{var f=els[i].form;if(f){var a=f.querySelector('input[name=\"action\"]');if(a&&!a.value)a.value='allow';}}catch(e){}els[i].click();return 'CLICKED:'+x;}return 'NOBTN';}catch(e){return 'E:'+e;}})(" + JSON.stringify(list) + ")";
    var r = runJsSync(js);
    log((label || "") + " 控件点击: " + r);
    return String(r).indexOf("CLICKED") === 0;
}
function actByText(list, label) {
    // 单一控件点击（v3：统一走补值版控件点击）
    return pressByText(list, label);
}
function nukeOverlays(label) {
    var r = runJsSync("(function(){try{var n=0;var els=document.querySelectorAll('#onetrust-consent-sdk,#onetrust-banner-sdk,#onetrust-pc-sdk,.onetrust-pc-dark-filter,[id^=\"onetrust\"],[class*=\"onetrust\"]');for(var i=0;i<els.length;i++){try{els[i].remove();n++;}catch(e){}}return 'REMOVED:'+n;}catch(e){return 'E:'+e;}})()");
    log((label || "") + " 清覆盖层: " + r);
}
function getSso() {
    var urls = ["https://grok.com", "https://accounts.x.ai", "https://x.ai"];
    for (var i = 0; i < urls.length; i++) {
        var c = null;
        try { c = cm.getCookie(urls[i]); } catch (e) {}
        if (c) {
            var m = c.match(/(?:^|;\s*)sso=([^;]+)/);
            if (m) return m[1];
        }
    }
    return null;
}
function clearCookies() {
    try { cm.removeAllCookies(null); cm.flush(); } catch (e) {}
    sleep(250);
}

// ---- Turnstile：token 长度监控（触发统一走 execute，不再坐标触摸）----
function tsTokenLen() {
    var raw = runJsSync("(function(){try{var e=document.querySelector('input[name=\"cf-turnstile-response\"]');return e&&e.value?String(e.value.length):'0';}catch(e){return '0';}})()");
    return parseInt(raw || "0", 10) || 0;
}
// ---- DuckMail ----
function duckToken(email, mailPw) {
    try {
        http.postJson(DUCK + "/accounts", { address: email, password: mailPw, expiresIn: 0 }, {});
    } catch (e) { log("建箱（可能已存在）: " + e); }
    var tok = http.postJson(DUCK + "/token", { address: email, password: mailPw }, {});
    if (tok.statusCode >= 300) throw new Error("DuckMail token HTTP " + tok.statusCode);
    return JSON.parse(tok.body.string()).token;
}
function duckCode(jwt) {
    for (var k = 0; k < 48; k++) {
        sleep(2000);
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
        } catch (e) { log("拉信异常: " + e); }
        if (k % 10 === 9) { actByText(["重新发送", "Resend"], "[码页]"); }
    }
    return null;
}

// ---- 文件桥: 等 Termux 侧的 Graph watcher 把 x.ai 验证码写进来 ----
function codeFromFile() {
    var f = GROK + "/log/grok_otp_" + RUNID + ".txt";
    for (var k = 0; k < 100; k++) {
        sleep(3000);
        try { if (files.exists(f)) { var c = String(files.read(f)).trim(); if (c) return c; } } catch (e) {}
        if (k % 20 === 19) { actByText(["重新发送", "Resend"], "[码页]"); }
    }
    return null;
}

// ---- 表单填充 ----
function fillEmail(v) {
    return runJsSync("(function(){try{var em=document.querySelector('input[type=email]')||document.querySelector('input[name=email]');if(!em)return 'NOEMAIL';var d=Object.getOwnPropertyDescriptor(em.__proto__,'value');d.set.call(em,'" + v + "');em.dispatchEvent(new Event('input',{bubbles:true}));return 'EMAIL_OK';}catch(e){return 'E:'+e;}})()");
}
function fillCode(code) {
    var flat = code.replace(/-/g, "");
    return runJsSync("(function(code){try{var ins=document.querySelectorAll('input');var vis=[];for(var i=0;i<ins.length;i++){var t=(ins[i].type||'').toLowerCase();if(t==='email'||t==='password'||t==='hidden'||t==='checkbox')continue;var r=ins[i].getBoundingClientRect();if(r.width<=0||r.height<=0)continue;vis.push(ins[i]);}if(vis.length===0)return 'NOBOX';var d;var one=vis.filter(function(e){return String(e.maxLength)==='1'||e.getAttribute('maxlength')==='1';});if(one.length>=4){for(var k=0;k<one.length&&k<code.length;k++){d=Object.getOwnPropertyDescriptor(one[k].__proto__,'value');d.set.call(one[k],code.charAt(k));one[k].dispatchEvent(new Event('input',{bubbles:true}));}return 'FILLED_BOXES_'+one.length;}d=Object.getOwnPropertyDescriptor(vis[0].__proto__,'value');d.set.call(vis[0],code);vis[0].dispatchEvent(new Event('input',{bubbles:true}));return 'FILLED_ONE';}catch(e){return 'E:'+e;}})('" + flat + "')");
}
function fillProfile(given, family, pass) {
    var js = "(function(g,f,p){try{var ins=document.querySelectorAll('input');var txts=[],pws=[];for(var i=0;i<ins.length;i++){var t=(ins[i].type||'text').toLowerCase();var r=ins[i].getBoundingClientRect();if(r.width<=0||r.height<=0)continue;if(t==='password')pws.push(ins[i]);else if(t==='text'||t==='')txts.push(ins[i]);}var d=function(el,v){var dd=Object.getOwnPropertyDescriptor(el.__proto__,'value');dd.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};if(txts.length>0)d(txts[0],g);if(txts.length>1)d(txts[1],f);for(var k=0;k<pws.length;k++)d(pws[k],p);return 'T'+txts.length+'_P'+pws.length;}catch(e){return 'E:'+e;}})('" + given + "','" + family + "','" + pass + "')";
    return runJsSync(js);
}
function fillPassword(v) {
    return runJsSync("(function(){try{var pw=document.querySelector('input[type=password]');if(!pw)return 'NOPW';var d=Object.getOwnPropertyDescriptor(pw.__proto__,'value');d.set.call(pw,'" + v + "');pw.dispatchEvent(new Event('input',{bubbles:true}));return 'PW_OK';}catch(e){return 'E:'+e;}})()");
}

// ---- Turnstile 深度诊断（组件/API/iframe 全量）----
function diagTs(label) {
    var r = runJsSync("(function(){try{var out={api:(typeof window.turnstile),exe:(window.turnstile&&typeof window.turnstile.execute==='function')?'yes':'no',cln:0,cli:'',frames:[]};try{var cl=document.querySelectorAll('.cf-turnstile');out.cln=cl.length;if(cl.length){var c=cl[0];out.cli=String(c.getAttribute('data-sitekey')||'').slice(0,24)+' '+(function(el){var rr=el.getBoundingClientRect();return Math.round(rr.width)+'x'+Math.round(rr.height);})(c);}}catch(e){}function walk(root,d){if(!root||d>8)return;var fs;try{fs=root.querySelectorAll('iframe');}catch(e){fs=[];}for(var i=0;i<fs.length;i++){try{var rr=fs[i].getBoundingClientRect();out.frames.push(String(fs[i].src||'').slice(0,50)+' '+Math.round(rr.width)+'x'+Math.round(rr.height));}catch(e){}}var els;try{els=root.querySelectorAll('*');}catch(e){els=[];}for(var j=0;j<els.length;j++){try{if(els[j].shadowRoot)walk(els[j].shadowRoot,d+1);}catch(e){}}}walk(document,0);return JSON.stringify(out);}catch(e){return 'E:'+e;}})()");
    log((label || "") + " diag: " + String(r).slice(0, 380));
    var ex = runJsSync("(function(){try{if(window.turnstile&&window.turnstile.execute){var w=document.querySelector('.cf-turnstile')||document.querySelector('[data-sitekey]');if(w){window.turnstile.execute(w);return 'EXEC_W';}window.turnstile.execute();return 'EXEC_ANY';}return 'NO_API';}catch(e){return 'ERR:'+e;}})()");
    log((label || "") + " turnstile.execute: " + ex);
}

// ---- 主动触发隐形 Turnstile（execute）----
function tsExecute() {
    var ex = runJsSync("(function(){try{if(window.turnstile&&window.turnstile.execute){var w=document.querySelector('.cf-turnstile')||document.querySelector('[data-sitekey]');if(w){window.turnstile.execute(w);return 'EXEC_W';}window.turnstile.execute();return 'EXEC_ANY';}return 'NO_API';}catch(e){return 'ERR:'+e;}})()");
    log("[6] tsExecute: " + ex);
    return ex !== "NO_API";
}
function hasSubmitErr() {
    var bt = bodyText();
    return /Something went wrong|出错了|请重试|try again/i.test(bt);
}
// ---- 验证真人超时/失败态：出现「请验证您是真人」勾选框（className=CheckBox）时必须点击（execute 无效）----
function tsClickBox(label) {
    try {
        var el = null;
        try { el = desc("请验证您是真人").className("CheckBox").findOne(500); } catch (e) {}
        if (!el) { try { el = className("CheckBox").descContains("请验证").findOne(200); } catch (e) {} }
        if (!el) { try { el = descContains("请验证您是真人").findOne(200); } catch (e) {} }
        if (!el) { try { el = descContains("Verify you are human").findOne(200); } catch (e) {} }
        if (el) {
            var ok = false;
            try { ok = el.click(); } catch (e2) {}
            log((label || "") + " 勾选框[请验证您是真人]: " + (ok ? "CLICKED" : "FOUND_但点击失败"));
            return true;
        }
    } catch (e) { log((label || "") + " 勾选框异常: " + e); }
    return false;
}
function tsRefresh(label) {
    var r = runJsSync("(function(){try{var inp=document.querySelector('input[name=\"cf-turnstile-response\"]');if(inp)inp.value='';var w=document.querySelector('.cf-turnstile')||document.querySelector('[data-sitekey]');if(window.turnstile&&window.turnstile.reset){try{window.turnstile.reset(w||null);}catch(e){}}if(window.turnstile&&window.turnstile.execute){if(w){window.turnstile.execute(w);}else{window.turnstile.execute();}return 'RESET_EXEC';}return 'NO_API';}catch(e){return 'ERR:'+e;}})()");
    log((label || "") + " tsRefresh: " + r);
    if (r === "NO_API") return 0;
    for (var i = 0; i < 10; i++) {
        sleep(2500);
        if (tsTokenLen() > 0) { log((label || "") + " 新 tsToken(" + tsTokenLen() + ")"); return tsTokenLen(); }
    }
    return tsTokenLen();
}
// 提交类动作：控件点击一次 → 短等 5 秒（重试与错误处理由调用方循环负责）
function actSubmit(list, label) {
    var clicked = pressByText(list, label);
    sleep(4000);
    return clicked;
}
// ---- 兜底：账号可能已在服务端创建 → 直接登录抓 sso ----
function fallbackLogin(email, password) {
    ui.run(function () { ui.wv.loadUrl("https://accounts.x.ai/sign-in?redirect=grok-com&email=true"); });
    sleep(4500);
    var rf = fillEmail(email);
    log("[兜底登录] 填邮箱: " + rf);
    if (String(rf).indexOf("EMAIL_OK") < 0) return false;
    sleep(1000);
    actByText(["Next", "继续", "下一步", "Continue"], "[兜底登录]");
    sleep(3500);
    if (inputInv().indexOf("password") < 0) { log("[兜底登录] 无密码框（账号可能未创建）"); return false; }
    log("[兜底登录] 填密码: " + fillPassword(password));
    sleep(600);
    var errN = 0;
    for (var i = 0; i < 5; i++) {
        tsRefresh("[兜底登录]");
        actSubmit(["Login", "Log in", "登录", "Sign in"], "[兜底登录]");
        sleep(2500);
        if (getSso()) { log("[兜底登录] 已登录成功"); return true; }
        if (hasSubmitErr()) {
            errN++;
            log("[兜底登录] 提交出错(" + errN + ")");
            if (errN >= 3) break;
            sleep(4000);
        }
    }
    return false;
}

// ---- OAuth 设备码（复用 Termux 侧 grok_oauth.py）----
function oauthClickablesDump(label) {
    var r = runJsSync("(function(){try{var els=document.querySelectorAll('button,[role=\"button\"],a,input[type=submit]');var out=[];for(var i=0;i<els.length;i++){var t=(els[i].innerText||els[i].value||'').trim();if(t)out.push(t.slice(0,16));}return JSON.stringify(out);}catch(e){return 'E:'+e;}})()");
    log((label || "") + " 可点元素: " + String(r).slice(0, 320));
}
function oauthAct(list, label) {
    // 全控件点击：「允许」提交按钮会自动补 hidden action=allow（横幅不影响控件点击，不再清理）
    return pressByText(list, label);
}
function dumpConsent() {
    var r = runJsSync("(function(){try{var out={url:String(location.href).slice(0,130),forms:[]};var fs=document.querySelectorAll('form');for(var i=0;i<fs.length&&i<2;i++){out.forms.push({action:String(fs[i].action||'').slice(0,220),method:fs[i].method,html:String(fs[i].outerHTML||'').slice(0,1100)});}var bs=document.querySelectorAll('button');out.btns=[];for(var j=0;j<bs.length&&j<6;j++){var t=(bs[j].innerText||'').trim();if(!t)continue;out.btns.push({t:t.slice(0,8),name:bs[j].name||'',value:bs[j].value||'',type:bs[j].type||''});}return JSON.stringify(out);}catch(e){return 'E:'+e;}})()");
    log("[oauth] 表单结构: " + String(r).slice(0, 1600));
}
function oauthProbeInstall() {
    var r = runJsSync("(function(){try{window.__h={clicks:[],submits:[],doc:[]};var f=document.querySelector('form');if(f){f.addEventListener('submit',function(e){window.__h.submits.push('t'+Math.round(performance.now())+' defPrevented='+e.defaultPrevented);},true);}var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){var x=(bs[i].innerText||'').trim();if(x==='允许'||x==='拒绝'){(function(txt,el){el.addEventListener('click',function(e){window.__h.clicks.push(txt+' t'+Math.round(performance.now())+' trusted='+e.isTrusted);},true);})(x,bs[i]);}}document.addEventListener('click',function(e){try{window.__h.doc.push(String(e.target.tagName)+'|'+String(e.target.innerText||'').slice(0,10)+' trusted='+e.isTrusted);}catch(err){}},true);return 'INSTALLED';}catch(e){return 'E:'+e;}})()");
    log("[oauth] 探针安装: " + r);
}
function oauthProbeRead(label) {
    var r = runJsSync("(function(){try{return JSON.stringify(window.__h||{});}catch(e){return 'E:'+e;}})()");
    log((label || "") + " 探针: " + String(r).slice(0, 520));
}
function oauthForceAllow() {
    // 兜底：表单 hidden action 为空、按钮无值——页面靠自身 JS 点按钮时填 action=allow；
    // 如果命中触摸多次无效，直接填值 + requestSubmit 走一遍表单 POST
    var r = runJsSync("(function(){try{var f=document.querySelector('form');if(!f)return 'NOFORM';var a=f.querySelector('input[name=action]');if(a)a.value='allow';var p=f.querySelector('input[name=principal_id]');var str='action='+(a?a.value:'-')+' pidLen='+(p?String(p.value).length:-1);try{f.requestSubmit();return 'SUBMITTED '+str;}catch(e1){try{f.submit();return 'SUBMITTED2 '+str;}catch(e2){return 'E:'+e2;}}}catch(e){return 'E:'+e;}})()");
    log("[oauth] 填值提交兜底: " + r);
}

function oauthDirectApprove() {
    // 后台兜底：不依赖页面自身 JS（后台节流会让它的处理链丢 action），直接填 action=allow（尽力补 principal_id）后提交
    var r = runJsSync("(function(){try{var f=document.querySelector('form');if(!f)return 'NOFORM';var a=f.querySelector('input[name=action]');if(a)a.value='allow';var p=f.querySelector('input[name=principal_id]');var src='';if(p&&!p.value){var m=String(document.documentElement.innerHTML).match(/principal[_-]?id[\"']?\\s*[:=]\\s*[\"']([A-Za-z0-9_-]{6,80})[\"']/i);if(m){p.value=m[1];src='+json';}}var str='action='+(a?a.value:'-')+' pid='+(p?(p.value?src||'pre':'-EMPTY'):'-NOFIELD');try{f.requestSubmit();}catch(e1){try{f.submit();}catch(e2){return 'E:'+e2;}}return 'SUBMITTED '+str;}catch(e){return 'E:'+e;}})()");
    log("[oauth] 直提交兜底: " + r);
    sleep(2500);
    return r;
}

var OAUTH_WORDS = ["授权", "允许", "同意", "继续", "批准", "确认", "知道了", "Got it", "Authorize", "Allow", "Continue", "Accept", "Approve", "Confirm"];
function oauthAuthorize(email) {
    var state = null, url = null;
    try {
        var res = http.get(CTRL + "/new?email=" + email);
        if (res.statusCode !== 200) { log("[oauth] 控制服务 HTTP " + res.statusCode + "，跳过"); return false; }
        var d = JSON.parse(res.body.string());
        state = d.state; url = d.url;
    } catch (e) { log("[oauth] 连不上控制服务(" + e + ")，跳过"); return false; }
    log("[oauth] 打开授权页 " + String(url).slice(0, 90));
    ui.run(function () { ui.wv.loadUrl(url); });
    waitJs("document.readyState==='complete'", 6000, 250);
    sleep(150);
    var lastSt = "", idle = 0, triedDirect = false;
    for (var i = 0; i < 14; i++) {
        var bt = bodyText();
        var href = String(runJsSync("String(location.href)"));
        if (href.indexOf("device/done") >= 0 || /设备已授权|已获授权|device (is )?authorized|可以关闭此窗口/i.test(bt)) { log("[oauth] 授权页已完成，等 token"); break; }
        if (/Invalid action/i.test(bt)) {
            if (!triedDirect) {
                triedDirect = true;
                log("[oauth] 报 Invalid action → 回退同意页 + 直提交兜底（不换设备码）");
                try { dumpConsent(); } catch (e0) {}
                ui.run(function () { ui.wv.loadUrl(url); });
                waitJs("document.readyState==='complete'", 6000, 250);
                sleep(1000);
                oauthDirectApprove();
                continue;
            }
            log("[oauth] Invalid action（直提交仍失败，交给新设备码重试）");
            break;
        }
        if (i < 2) { log("[oauth] 页(" + (i + 1) + "): " + bt.slice(0, 120).replace(/\n/g, " | ")); }
        var st = href + "|" + bt.slice(0, 50);
        if (st === lastSt) {
            idle++;
            if (idle >= 4) { idle = 0; oauthAct(OAUTH_WORDS, "[oauth]"); }
            sleep(600);
            continue;
        }
        lastSt = st; idle = 0;
        oauthAct(OAUTH_WORDS, "[oauth]");
        sleep(600);
    }
    for (var w = 0; w < 12; w++) {
        sleep(1500);
        try {
            var st = JSON.parse(http.get(CTRL + "/status?state=" + state).body.string());
            if (st.done) {
                log("[oauth] " + (st.ok ? "token 已保存 ✓ " + st.token_file : "失败: " + st.msg));
                return !!st.ok;
            }
        } catch (e) {}
        if (w === 6) { log("[oauth] 状态轮询中，页面: " + bodyText().slice(0, 130).replace(/\n/g, " | ")); }
    }
    log("[oauth] 超时未拿到 token；页面: " + bodyText().slice(0, 160).replace(/\n/g, " | "));
    return false;
}

function main() {
    log("=== WebView 注册一步到位 v2 开始，目标 " + ROUNDS + " 轮 ===");
    ui.run(function () { ui.wv.getLocationOnScreen(WV); });
    sleep(400);
    DPR = parseFloat(runJsSync("String(window.devicePixelRatio||1)")) || 1;
    log("WebView 偏移(" + WV[0] + "," + WV[1] + ") DPR=" + DPR);
    var ok = 0, fail = 0;
    for (var round = 1; round <= ROUNDS; round++) {
        log("---- 第 " + round + "/" + ROUNDS + " 轮 ----");
        var email = "", mailPw = "", password = "", given = "", family = "";
        try {
            clearCookies();
            email = FIXED_EMAIL;
            mailPw = "outlook";
            password = "N" + rnd(8) + "!a7#" + rnd(10);
            given = rndName(5);
            family = rndName(6);
            // 先发起注册页加载，与邮箱建箱并行（省 2~3 秒）
            ui.run(function () { ui.wv.loadUrl(SIGNUP_URL); });
            log("[1] 邮箱(outlook): " + email);

            // ---- P1: 页面就绪即动作（主动轮询，不固定等待）----
            var emailForm = false;
            for (var a1 = 0; a1 < 3 && !emailForm; a1++) {
                if (a1 > 0) { ui.run(function () { ui.wv.loadUrl(SIGNUP_URL); }); }
                waitJs("document.readyState==='complete'", 8000, 250);
                sleep(200);
                if (inputInv().indexOf("email") >= 0) { emailForm = true; break; }
                jsClickByText(["使用邮箱注册", "Sign up with email", "邮箱注册"], "[2]");
                if (waitJs("!!document.querySelector('input[type=email],input[name=email]')", 4000, 200)) { emailForm = true; break; }
                pressByText(["使用邮箱注册", "Sign up with email", "邮箱注册"], "[2]");
                if (waitJs("!!document.querySelector('input[type=email],input[name=email]')", 3000, 200)) { emailForm = true; break; }
                log("[2] 第" + (a1 + 1) + "次未进入邮箱表单，输入框: " + inputInv().slice(0, 150));
            }
            if (!emailForm) { log("[2] 无法进入邮箱表单"); throw new Error("无法进入邮箱表单"); }
            log("[2] 邮箱表单 OK");

            // ---- P2: 填邮箱并提交 ----
            log("[3] 填邮箱: " + fillEmail(email));
            var submitted = false;
            for (var a2 = 0; a2 < 3 && !submitted; a2++) {
                actByText(["注册", "Sign up", "Continue", "继续"], "[3]");
                sleep(3500);
                var invNow = inputInv();
                var bt1 = bodyText();
                if (invNow.indexOf("email") < 0 || /验证您的邮箱|输入验证码|Enter the code|验证码/i.test(bt1)) { submitted = true; break; }
                log("[3] 提交后仍是表单，重试 " + (a2 + 1) + "；输入框: " + invNow.slice(0, 120));
            }
            log("[3] 邮箱提交: " + submitted);

            // ---- P3: 验证码 ----
            if (submitted) {
                log("[4] 等邮箱验证码…");
                try { files.write(GROK + "/log/otp_want.txt", RUNID); } catch (e9) {}
                log("[4] 已通知收码 watcher(runid=" + RUNID + "), 等文件桥…");
                var code = codeFromFile();
                if (code) {
                    log("[4] 验证码: 已获取(长度" + code.length + ")");
                    log("[4] 填码: " + fillCode(code));
                    if (!waitJs("!!document.querySelector('input[type=password]')", 5000, 300)) {
                        actByText(["确认邮箱", "确认", "验证", "Continue", "Verify"], "[4]");
                    }
                } else {
                    log("[4] 未收到验证码（尝试继续按资料页处理）");
                }
            }

            // ---- P4: 资料页 ----
            for (var a4 = 0; a4 < 5; a4++) {
                if (inputInv().indexOf("password") >= 0) break;
                sleep(2500);
            }
            log("[5] 资料页输入框: " + inputInv().slice(0, 200));
            log("[5] 资料: " + fillProfile(given, family, password));

            // ---- P5: 完成注册（Turnstile 补点 + 多次点击 + 诊断）----
            var sso = null;
            var errStreak = 0;
            for (var c = 0; c < 8 && !sso; c++) {
                sso = getSso();
                if (sso) { log("[6] 已见 sso → 成功"); break; }
                var tl = tsTokenLen();
                if (tl <= 0) {
                    // 先给页面 2 秒自发出 token 的机会（实测约 0.6 秒生成），仍没有才补救
                    if (!waitJs("(document.getElementsByName('cf-turnstile-response')[0]||{value:''}).value.length>0", 2000, 250)) {
                        // 超时/失败态 = 「请验证您是真人」勾选框（execute 无效，必须点击）
                        if (!tsClickBox("[6]")) { tsRefresh("[6]"); }
                    }
                    tl = tsTokenLen();
                }
                var clicked = actSubmit(["完成注册", "Create account", "Finish", "提交"], "[6]");
                if (c < 2) { log("[6] c" + c + " tsToken=" + tl + " 点击=" + clicked + " 页面: " + bodyText().slice(0, 90).replace(/\n/g, " | ")); }
                if (!clicked) { sleep(1500); continue; }
                for (var w2 = 0; w2 < 10; w2++) {
                    sleep(2000);
                    if (w2 === 2) { tsClickBox("[6等待]"); }
                    if (getSso()) { log("[6] sso 已出现"); break; }
                    if (hasSubmitErr()) { log("[6] 提交被拒(Something went wrong)"); break; }
                    if (w2 === 6) { log("[6] 进入下一轮"); break; }
                }
                if (hasSubmitErr()) {
                    errStreak++;
                    if (errStreak >= 3) { log("[6] 连续出错 " + errStreak + " 次，疑似风控/限流，本轮放弃"); break; }
                    log("[6] 出错重试准备（第 " + errStreak + " 次）");
                    sleep(5000);
                } else {
                    errStreak = 0;
                    sleep(1500);
                }
            }

            // ---- P6: 硬判据 = sso（没有先走"兜底登录"再判）----
            if (!sso) {
                ui.run(function () { ui.wv.loadUrl("https://grok.com/"); });
                waitJs("document.readyState==='complete'", 6000, 250);
                sleep(250);
                sso = getSso();
            }
            if (!sso) {
                log("[6] 提交未确认登录态 → 尝试兜底登录（账号可能已创建）");
                if (fallbackLogin(email, password)) { sso = getSso(); }
            }
            if (sso) {
                files.append(SSO_OUT, email + "----" + sso + "\n");
                try { files.write(GROK + "/log/grok_outlook_result.txt", "SUCCESS " + email + " ssoLen=" + sso.length + " " + new Date().toISOString() + "\n"); } catch (e3) {}
                log("[7] sso 已保存(长度" + sso.length + ")");
                var okOauth = false;
                log("[oauth] 验证轮跳过 token 抓取");
                files.append(ACCOUNTS, email + "----" + mailPw + "----" + password + "----" + given + " " + family + "----OK-" + new Date().toISOString() + "\n");
                log(">>> 第 " + round + " 轮成功: " + email + " (oauth=" + okOauth + ")");
                ok++;
            } else {
                files.append(ACCOUNTS, email + "----" + mailPw + "----" + password + "----" + given + " " + family + "----UNKNOWN-" + new Date().toISOString() + "\n");
                log(">>> 第 " + round + " 轮未确认（无 sso）: " + email);
                try { files.write(GROK + "/log/grok_outlook_result.txt", "FAIL " + email + " " + new Date().toISOString() + "\n"); } catch (e4) {}
                log("    页面: " + bodyText().slice(0, 150).replace(/\n/g, " | "));
                log("    输入框: " + inputInv().slice(0, 150));
                fail++;
            }
            clearCookies();
        } catch (e) {
            fail++;
            log(">>> 第 " + round + " 轮异常: " + e);
            try { files.append(ACCOUNTS, "ROUND" + round + "-ERR-" + String(e).slice(0, 70) + "-" + new Date().toISOString() + "\n"); } catch (e2) {}
            clearCookies();
        }
    }
    log("=== 批量结束: 成功 " + ok + " / 失败 " + fail + " ===");
}

threads.start(function () {
    try { main(); } catch (e) { log("EXCEPTION: " + e); }
    sleep(3000);   // 留时间让调试条显示最终结果
    log("=== 任务结束，自动退出脚本 ===");
    try { ui.run(function () { try { ui.finish(); } catch (e) {} }); } catch (e) {}
    sleep(600);
    exit();
});
