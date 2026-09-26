"auto";
// aj6_ol_tokentest.js —— 验证两件事:
//  1) http.post 对象形参的请求形状对(假 code 应换来 MS 的 invalid_grant JSON 错误, 而不是 JS 异常)
//  2) 池里的 refresh_token 真的能刷出 access_token; 若 MS 轮换 refresh_token 则写回池文件
var DIR = "/storage/emulated/0/Hermes工作区/grok";
var LOG = DIR + "/log/ol_tokentest.txt";
var POOL = DIR + "/outlook-accounts.txt";
var TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
function log(m) { console.log(m); try { files.append(LOG, "[" + new Date().toTimeString().slice(0, 8) + "] " + m + "\n"); } catch (e) {} }
try { files.write(LOG, ""); } catch (e) {}

var line = "";
try { line = String(files.read(POOL)).split("\n")[0]; } catch (e) {}
var f = line.split("----");
if (f.length < 4) { log("池里没有可用行 (f=" + f.length + ")"); log("TEST_DONE"); exit(); }
var email = f[0], pw = f[1], client = f[2], rt = f[3];
log("账号: " + email + " rt_len=" + rt.length);

// 1) 形状测试: 假 code, 期望 MS 返回 invalid_grant 的 JSON(说明请求形状/编码正确)
try {
    var r1 = http.post(TOKEN_URL, {
        client_id: client, grant_type: "authorization_code",
        redirect_uri: "https://localhost",
        scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
        code: "dummy123"
    }, {});
    log("形状测试: " + String(r1.body.string()).slice(0, 160));
} catch (e1) { log("!! 形状测试异常: " + e1); }

// 2) 真刷新
try {
    var r2 = http.post(TOKEN_URL, {
        client_id: client, grant_type: "refresh_token",
        refresh_token: rt,
        scope: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access"
    }, {});
    var t2 = String(r2.body.string());
    var j2 = null; try { j2 = JSON.parse(t2); } catch (e) {}
    if (j2 && j2.access_token) {
        log("刷新成功: access_token len=" + String(j2.access_token).length + ", 新 refresh_token len=" + (j2.refresh_token ? String(j2.refresh_token).length : 0));
        if (j2.refresh_token && String(j2.refresh_token) !== rt) {
            var all = String(files.read(POOL)).split("\n");
            for (var i = 0; i < all.length; i++) {
                if (all[i].indexOf(email + "----") === 0) all[i] = email + "----" + pw + "----" + client + "----" + j2.refresh_token;
            }
            files.write(POOL, all.join("\n"));
            log("已把轮换后的 refresh_token 写回池文件");
        }
    } else {
        log("!! 刷新失败: " + t2.slice(0, 200));
    }
} catch (e2) { log("!! 刷新异常: " + e2); }
log("TEST_DONE");
