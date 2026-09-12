#!/usr/bin/env python3
"""
يبني مخرجين من نفس المصدر:
  index.html  — النسخة المنشورة على الإنترنت، بياناتها مشفّرة خلف كلمة مرور (payload.js)
  dist.html   — ملف واحد مكتفٍ بذاته بلا كلمة مرور، للنشر كـ Artifact خاص

المصدر: shell.part (الواجهة والتنسيق) + app.js (منطق التطبيق) + data.js (البيانات الخام)
لإعادة التشفير بكلمة مرور جديدة:  python3 build.py --password "كلمة جديدة"
"""
import argparse, base64, gzip, json, os, secrets
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERE = os.path.dirname(os.path.abspath(__file__))
p = lambda *a: os.path.join(HERE, *a)

GATE_CSS = """
.gate{position:fixed;inset:0;z-index:100;background:var(--bg);display:grid;place-items:center;padding:24px}
.gatebox{width:min(380px,100%);background:var(--surface);border:1px solid var(--line);
  border-top:3px solid var(--brass);border-radius:var(--r);padding:24px;box-shadow:var(--shadow);
  display:flex;flex-direction:column;gap:12px}
.gatebox h2{font-size:19px}
.gatebox p{margin:0;font-size:12.5px;color:var(--ink-2);line-height:1.7}
.gatebox input{background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;
  padding:9px 11px;width:100%;font-size:15px}
.gateerr{font-size:12.5px;color:var(--bad);background:var(--bad-soft);border-radius:8px;padding:8px 10px}
"""

GATE_HTML = """
<div class="gate" id="gate">
  <form class="gatebox" id="gateForm">
    <div class="eyebrow">وصول محمي</div>
    <h2>تسعير مخزون العطور</h2>
    <p>بيانات المورد مشفّرة داخل الصفحة نفسها. أدخل كلمة المرور لفكّها — تُحفظ على هذا الجهاز فلا تُطلب مرة أخرى.</p>
    <input type="password" id="pw" placeholder="كلمة المرور" autocomplete="current-password" required>
    <button class="btn primary" type="submit" id="gateBtn">فتح الجدول</button>
    <div class="gateerr" id="gateErr" hidden></div>
  </form>
</div>
"""

GATE_JS = """
(function(){
  var $=function(i){return document.getElementById(i)};
  var b=function(s){return Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)})};

  async function unlock(pw){
    var e=window.ENC;
    var km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
    var key=await crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:b(e.s),iterations:e.it,hash:'SHA-256'},
      km,{name:'AES-GCM',length:256},false,['decrypt']);
    var plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b(e.n)},key,b(e.c));
    var txt=await new Response(new Blob([plain]).stream()
              .pipeThrough(new DecompressionStream('gzip'))).text();
    window.PRODUCTS=JSON.parse(txt);
  }

  function open_(){ $('gate').remove(); window.bootApp(); }

  function fail(msg){
    var el=$('gateErr'); el.textContent=msg; el.hidden=false;
    $('gateBtn').disabled=false; $('gateBtn').textContent='فتح الجدول';
  }

  $('gateForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    var pw=$('pw').value;
    $('gateBtn').disabled=true; $('gateBtn').textContent='جارٍ الفتح…'; $('gateErr').hidden=true;
    unlock(pw).then(function(){
      try{ localStorage.setItem('sp_pw',pw); }catch(e){}
      open_();
    }).catch(function(err){
      if(!window.crypto||!crypto.subtle) return fail('المتصفح يمنع فك التشفير. افتح الصفحة عبر https.');
      if(typeof DecompressionStream==='undefined') return fail('متصفحك قديم ولا يدعم فك الضغط. حدّثه أو استخدم متصفحاً آخر.');
      fail('كلمة المرور غير صحيحة.');
    });
  });

  // فتح تلقائي إن سبق الفتح على هذا الجهاز
  var saved=null; try{ saved=localStorage.getItem('sp_pw'); }catch(e){}
  if(saved){
    $('gateBtn').disabled=true; $('gateBtn').textContent='جارٍ الفتح…';
    unlock(saved).then(open_).catch(function(){
      try{ localStorage.removeItem('sp_pw'); }catch(e){}
      $('gateBtn').disabled=false; $('gateBtn').textContent='فتح الجدول';
    });
  } else { $('pw').focus(); }
})();
"""


def encrypt(password):
    raw = open(p('data.js')).read()
    raw = raw[len('window.PRODUCTS='):].rstrip().rstrip(';')
    json.loads(raw)
    blob = gzip.compress(raw.encode('utf-8'), 9)
    salt, nonce, iters = secrets.token_bytes(16), secrets.token_bytes(12), 210000
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iters).derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, blob, None)
    b64 = lambda x: base64.b64encode(x).decode()
    out = "window.ENC=%s;" % json.dumps({"v": 1, "it": iters, "s": b64(salt), "n": b64(nonce), "c": b64(ct)})
    open(p('payload.js'), 'w').write(out)
    return len(out), len(raw)


def build(password=None):
    shell = open(p('shell.part')).read()
    app = open(p('app.js')).read()

    if password:
        n, o = encrypt(password)
        print("payload.js %.1f KB (من %.1f KB)" % (n / 1024, o / 1024))

    # النسخة المنشورة — محمية
    gated = (shell.replace('</style>', GATE_CSS + '</style>', 1)
             + GATE_HTML
             + '\n<script src="payload.js"></script>\n<script src="app.js"></script>\n'
             + '<script>' + GATE_JS + '</script>\n')
    open(p('index.html'), 'w').write(gated)

    # نسخة Artifact — ملف واحد بلا كلمة مرور
    data = open(p('data.js')).read()
    single = (shell + '<script>\n' + data + '\n</script>\n'
              + '<script>\n' + app + '\n</script>\n'
              + '<script>window.bootApp();</script>\n')
    open(p('dist.html'), 'w').write(single)

    print("index.html %.1f KB  ·  dist.html %.1f KB"
          % (os.path.getsize(p('index.html')) / 1024, os.path.getsize(p('dist.html')) / 1024))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--password', help='أعد تشفير البيانات بكلمة المرور هذه')
    a = ap.parse_args()
    build(a.password)
