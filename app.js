
window.bootApp = function(){
  "use strict";
  var P = window.PRODUCTS || [];

  /* ---------- storage ---------- */
  function load(k, d){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
  function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  var DEF = { shipUnit:1.2, shipPct:0, otherUnit:0, otherPct:3, vat:21,
              t1max:10, t1:120, t2max:30, t2:80, t3:60,
              rounding:'95', basisIncl:false, vatRec:true, hideOut:false, simple:false };
  var S = Object.assign({}, DEF, load('sp_settings', {}));
  var OV = load('sp_overrides', {});          // معدّلات سعر البيع اليدوية
  var CMP = [];                               // مفاتيح المنتجات المختارة للمقارنة

  var state = { q:'', brand:'', cat:'', sort:'profitStock', shown:120 };

  /* ---------- helpers ---------- */
  var eur = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:2});
  var eur0 = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0});
  var int0 = new Intl.NumberFormat('nl-NL');
  function money(v){ return eur.format(v||0); }
  function key(p){ return p.g || p.n; }
  function norm(s){ return (s||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[^a-z0-9؀-ۿ ]/g,' '); }

  P.forEach(function(p){ p._k = key(p); p._s = norm(p.n + ' ' + p.b + ' ' + p.g); });

  function roundRetail(v){
    if(S.rounding === 'none') return Math.round(v*100)/100;
    if(S.rounding === '50')  return Math.round(v*2)/2;
    if(S.rounding === '1')   return Math.round(v);
    var end = S.rounding === '99' ? 0.99 : 0.95;
    var r = Math.round(v - end) + end;
    return r < end ? end : r;
  }

  function calc(p){
    if(p.p === null || p.p === undefined) return { none:true };
    var vat = (+S.vat||0)/100;
    var whole = S.basisIncl ? p.p/(1+vat) : p.p;
    var ship  = (+S.shipUnit||0) + (+S.shipPct||0)/100*whole;
    var other = (+S.otherUnit||0) + (+S.otherPct||0)/100*whole;
    var landed = whole + ship + other;
    var salesVat = S.vatRec ? vat : 0;
    if(!S.vatRec) landed = landed * (1+vat);          // ضريبة الشراء تصبح تكلفة
    var mk = whole <= (+S.t1max) ? (+S.t1) : whole <= (+S.t2max) ? (+S.t2) : (+S.t3);
    var target = landed * (1 + (mk||0)/100) * (1 + salesVat);
    var ov = OV[p._k];
    var retail = (typeof ov === 'number' && ov > 0) ? ov : roundRetail(target);
    var net = retail/(1+salesVat);
    var vatAmt = retail - net;
    var profit = net - landed;
    var margin = net > 0 ? profit/net*100 : 0;
    return { none:false, whole:whole, ship:ship, other:other, landed:landed, mk:mk,
             retail:retail, net:net, vatAmt:vatAmt, profit:profit, margin:margin,
             stockProfit:profit*p.s, stockCost:landed*p.s, stockRev:retail*p.s, edited:typeof ov === 'number' };
  }

  /* ---------- filtering ---------- */
  function filtered(){
    var terms = norm(state.q).split(' ').filter(Boolean);
    return P.filter(function(p){
      if(state.cat && p.c !== state.cat) return false;
      if(state.brand && p.b !== state.brand) return false;
      if(S.hideOut && p.s <= 0) return false;
      for(var i=0;i<terms.length;i++) if(p._s.indexOf(terms[i]) === -1) return false;
      return true;
    });
  }
  function sortRows(rows){
    var s = state.sort;
    rows.sort(function(a,b){
      var ca = a._c, cb = b._c;
      if(ca.none && cb.none) return 0;
      if(ca.none) return 1;
      if(cb.none) return -1;
      switch(s){
        case 'profitStock': return cb.stockProfit - ca.stockProfit;
        case 'profit':      return cb.profit - ca.profit;
        case 'margin':      return cb.margin - ca.margin;
        case 'stock':       return b.s - a.s;
        case 'whole':       return cb.whole - ca.whole;
        case 'wholeAsc':    return ca.whole - cb.whole;
        default:            return a.n.localeCompare(b.n);
      }
    });
    return rows;
  }

  /* ---------- columns ---------- */
  var COLS = [
    { id:'cmp',    h:'',                     full:true,  simple:true },
    { id:'name',   h:'المنتج',               full:true,  simple:true },
    { id:'stock',  h:'المخزون',              full:true,  simple:true,  n:true },
    { id:'whole',  h:'سعر الجملة',           full:true,  simple:true,  n:true },
    { id:'ship',   h:'الشحن',                full:true,  simple:false, n:true },
    { id:'other',  h:'تكاليف أخرى',          full:true,  simple:false, n:true },
    { id:'landed', h:'التكلفة النهائية',     full:true,  simple:true,  n:true },
    { id:'net',    h:'البيع بدون ضريبة',     full:true,  simple:false, n:true },
    { id:'vatAmt', h:'ض.ق.م ٢١٪',            full:true,  simple:false, n:true },
    { id:'retail', h:'سعر البيع للجمهور',    full:true,  simple:true,  n:true },
    { id:'profit', h:'الربح للوحدة',         full:true,  simple:true,  n:true },
    { id:'margin', h:'الهامش',               full:true,  simple:true,  n:true },
    { id:'sp',     h:'ربح المخزون كله',      full:true,  simple:true,  n:true }
  ];
  function cols(){ return COLS.filter(function(c){ return S.simple ? c.simple : c.full; }); }

  var SORTMAP = { stock:'stock', whole:'whole', profit:'profit', margin:'margin', sp:'profitStock', name:'name' };

  /* ---------- render ---------- */
  var $ = function(id){ return document.getElementById(id); };

  function render(){
    P.forEach(function(p){ p._c = calc(p); });
    var rows = sortRows(filtered());

    // KPIs
    var priced = rows.filter(function(p){ return !p._c.none; });
    var inStock = priced.filter(function(p){ return p.s > 0; });
    var units = 0, cost = 0, rev = 0, prof = 0;
    inStock.forEach(function(p){ units += p.s; cost += p._c.stockCost; rev += p._c.stockRev; prof += p._c.stockProfit; });
    var kpi = [
      ['منتجات مطابقة للبحث', int0.format(rows.length), ''],
      ['أصناف متوفرة فعلياً', int0.format(inStock.length), ''],
      ['إجمالي القطع بالمخزن', int0.format(units), ''],
      ['قيمة المخزون بالتكلفة', eur0.format(cost), 'accent'],
      ['مبيعات متوقعة شاملة الضريبة', eur0.format(rev), ''],
      ['صافي الربح المتوقع', eur0.format(prof), 'good']
    ];
    $('kpis').innerHTML = kpi.map(function(k){
      return '<div class="kpi ' + k[2] + '"><div class="k">' + k[0] + '</div><div class="v num">' + k[1] + '</div></div>';
    }).join('');

    // brand bars
    var agg = {};
    inStock.forEach(function(p){
      var a = agg[p.b] || (agg[p.b] = { v:0, n:0 });
      a.v += p._c.stockProfit; a.n++;
    });
    var top = Object.keys(agg).map(function(b){ return { b:b, v:agg[b].v, n:agg[b].n }; })
                .sort(function(a,b){ return b.v - a.v; }).slice(0,8);
    var max = top.length ? top[0].v : 1;
    $('bars').innerHTML = top.length ? top.map(function(t){
      return '<div class="bar"><span class="bname" title="' + t.b + '">' + t.b + '</span>' +
        '<span class="btrack"><span class="bfill" style="width:' + Math.max(1.5, t.v/max*100) + '%"></span></span>' +
        '<span class="bval num">' + eur0.format(t.v) + '</span></div>';
    }).join('') : '<div class="empty">لا توجد بيانات مطابقة</div>';

    // head
    var cs = cols();
    $('thead').innerHTML = cs.map(function(c){
      var sortable = SORTMAP[c.id];
      var active = sortable && (state.sort === SORTMAP[c.id] || (c.id==='whole' && state.sort==='wholeAsc'));
      return '<th class="' + (c.n ? 'n' : '') + '" data-col="' + c.id + '">' + c.h +
             (active ? ' <span class="ar">▼</span>' : '') + '</th>';
    }).join('');

    // body
    var slice = rows.slice(0, state.shown);
    $('tbody').innerHTML = slice.length ? slice.map(function(p){ return rowHtml(p, cs); }).join('')
      : '<tr><td colspan="' + cs.length + '"><div class="empty">لا يوجد منتج مطابق لبحثك.</div></td></tr>';

    $('count').textContent = 'عرض ' + int0.format(slice.length) + ' من ' + int0.format(rows.length);
    $('more').innerHTML = rows.length > state.shown
      ? '<button class="btn primary" id="moreBtn">عرض ' + int0.format(Math.min(120, rows.length - state.shown)) + ' منتجاً إضافياً</button>' : '';
    var mb = $('moreBtn');
    if(mb) mb.onclick = function(){ state.shown += 120; render(); };

    renderCmp();
    window._rows = rows;
  }

  function pillClass(m){ return m >= 40 ? 'g' : m >= 20 ? 'w' : 'b'; }

  function rowHtml(p, cs){
    var c = p._c, out = p.s <= 0, sel = CMP.indexOf(p._k) > -1;
    var cells = cs.map(function(col){
      var cls = col.n ? ' class="n"' : '';
      if(col.id === 'cmp') return '<td><input type="checkbox" class="cmp" data-k="' + esc(p._k) + '"' + (sel ? ' checked' : '') + ' aria-label="أضف للمقارنة"></td>';
      if(col.id === 'name'){
        return '<td><span class="pname">' + esc(p.n) + '</span><span class="pmeta">' +
          '<span class="tag' + (p.c === 'cosmetica' ? ' cos' : '') + '">' + esc(p.b) + '</span>' +
          (p.g ? '<span class="tag gtin">' + p.g + '</span>' : '') +
          (c.none ? '<span class="pill b">بدون سعر</span>' : '') + '</span></td>';
      }
      if(col.id === 'stock') return out ? '<td' + cls + '><span class="stock zero">نفد</span></td>'
        : '<td' + cls + '><span class="stock num">' + int0.format(p.s) + '</span></td>';
      if(c.none) return '<td' + cls + '><span class="num" style="color:var(--muted)">—</span></td>';
      if(col.id === 'retail'){
        return '<td' + cls + '><input type="number" step="0.05" min="0" class="ov num' + (c.edited ? ' edited' : '') +
               '" data-k="' + esc(p._k) + '" value="' + c.retail.toFixed(2) + '" aria-label="سعر البيع للجمهور"></td>';
      }
      if(col.id === 'margin'){
        return '<td' + cls + '><span class="pill ' + pillClass(c.margin) + ' num">' + c.margin.toFixed(0) + '%</span></td>';
      }
      if(col.id === 'sp'){
        return '<td' + cls + '><span class="num" style="font-weight:600;color:' + (c.stockProfit > 0 ? 'var(--good)' : 'var(--muted)') + '">' + (p.s > 0 ? money(c.stockProfit) : '—') + '</span></td>';
      }
      if(col.id === 'profit'){
        return '<td' + cls + '><span class="num" style="font-weight:600;color:' + (c.profit > 0 ? 'var(--ink)' : 'var(--bad)') + '">' + money(c.profit) + '</span></td>';
      }
      var v = { whole:c.whole, ship:c.ship, other:c.other, landed:c.landed, net:c.net, vatAmt:c.vatAmt }[col.id];
      var weight = col.id === 'landed' ? ';font-weight:600' : '';
      var color = (col.id === 'ship' || col.id === 'other' || col.id === 'vatAmt') ? ';color:var(--ink-2)' : '';
      return '<td' + cls + '><span class="num" style="' + weight + color + '">' + money(v) + '</span></td>';
    }).join('');
    return '<tr class="' + (out ? 'out ' : '') + (sel ? 'sel' : '') + '">' + cells + '</tr>';
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m]; }); }

  /* ---------- compare ---------- */
  var CMPROWS = [
    ['سعر الجملة',        function(c){ return money(c.whole); }, null],
    ['الشحن',             function(c){ return money(c.ship); }, null],
    ['تكاليف أخرى',       function(c){ return money(c.other); }, null],
    ['التكلفة النهائية',  function(c){ return money(c.landed); }, null],
    ['البيع بدون ضريبة',  function(c){ return money(c.net); }, null],
    ['ض.ق.م',             function(c){ return money(c.vatAmt); }, null],
    ['سعر البيع للجمهور', function(c){ return money(c.retail); }, null],
    ['الربح للوحدة',      function(c){ return money(c.profit); }, 'profit'],
    ['الهامش',            function(c){ return c.margin.toFixed(0) + '%'; }, 'margin'],
    ['ربح المخزون كله',   function(c){ return money(c.stockProfit); }, 'stockProfit']
  ];

  function renderCmp(){
    var d = $('drawer');
    if(!CMP.length){ d.hidden = true; return; }
    d.hidden = false;
    var items = CMP.map(function(k){ return P.find(function(p){ return p._k === k; }); }).filter(Boolean);
    $('cmpN').textContent = items.length;
    var g = $('cmpgrid');
    g.style.gridTemplateColumns = '150px repeat(' + items.length + ', minmax(130px,1fr))';
    var html = '<div class="rowlab hd">المنتج</div>' + items.map(function(p){
      return '<div class="hd"><span class="pname" style="font-size:12px">' + esc(p.n) + '</span>' +
             '<span class="tag" style="margin-top:4px;display:inline-block">' + esc(p.b) + '</span></div>';
    }).join('');
    html += '<div class="rowlab">المخزون</div>' + items.map(function(p){
      return '<div class="num">' + (p.s > 0 ? int0.format(p.s) : 'نفد') + '</div>'; }).join('');
    CMPROWS.forEach(function(r){
      var best = null;
      if(r[2]){
        items.forEach(function(p){ if(!p._c.none && (best === null || p._c[r[2]] > best)) best = p._c[r[2]]; });
      }
      html += '<div class="rowlab">' + r[0] + '</div>' + items.map(function(p){
        if(p._c.none) return '<div class="num">—</div>';
        var isBest = r[2] && items.length > 1 && Math.abs(p._c[r[2]] - best) < 1e-9;
        return '<div class="num' + (isBest ? ' best' : '') + '">' + r[1](p._c) + '</div>';
      }).join('');
    });
    g.innerHTML = html;
  }

  /* ---------- wiring ---------- */
  var SETFIELDS = ['shipUnit','shipPct','otherUnit','otherPct','vat','t1max','t1','t2max','t2','t3'];
  SETFIELDS.forEach(function(f){
    var el = $(f);
    el.value = S[f];
    el.addEventListener('input', function(){
      S[f] = el.value === '' ? 0 : parseFloat(el.value);
      $('t1maxEcho').textContent = S.t1max; $('t2maxEcho').textContent = S.t2max;
      save('sp_settings', S); render();
    });
  });
  $('t1maxEcho').textContent = S.t1max; $('t2maxEcho').textContent = S.t2max;

  $('rounding').value = S.rounding;
  $('rounding').addEventListener('change', function(){ S.rounding = this.value; save('sp_settings', S); render(); });

  ['basisIncl','vatRec','hideOut','simple'].forEach(function(f){
    var el = $(f);
    el.checked = !!S[f];
    el.addEventListener('change', function(){ S[f] = el.checked; save('sp_settings', S); render(); });
  });

  var qt;
  $('q').addEventListener('input', function(){
    clearTimeout(qt);
    var v = this.value;
    qt = setTimeout(function(){ state.q = v; state.shown = 120; render(); }, 140);
  });
  $('sort').addEventListener('change', function(){ state.sort = this.value; state.shown = 120; render(); });
  $('brand').addEventListener('change', function(){ state.brand = this.value; state.shown = 120; render(); });

  document.querySelectorAll('.chip[data-cat]').forEach(function(ch){
    ch.addEventListener('click', function(){
      document.querySelectorAll('.chip[data-cat]').forEach(function(x){ x.classList.remove('on'); });
      ch.classList.add('on'); state.cat = ch.dataset.cat; state.shown = 120; render();
    });
  });

  $('thead').addEventListener('click', function(e){
    var th = e.target.closest('th'); if(!th) return;
    var id = th.dataset.col, s = SORTMAP[id]; if(!s) return;
    state.sort = (id === 'whole' && state.sort === 'whole') ? 'wholeAsc' : s;
    state.shown = 120; render();
  });

  // التعديل يُطبَّق عند مغادرة الحقل (change) حتى لا يختفي المؤشر أثناء الكتابة
  $('tbody').addEventListener('change', function(e){
    var t = e.target, k = t.dataset.k;
    if(t.classList.contains('cmp')){
      var i = CMP.indexOf(k);
      if(t.checked){ if(i === -1){ if(CMP.length >= 4) CMP.shift(); CMP.push(k); } }
      else if(i > -1) CMP.splice(i, 1);
      render();
    } else if(t.classList.contains('ov')){
      var v = parseFloat(t.value);
      if(t.value === '' || isNaN(v) || v <= 0) delete OV[k]; else OV[k] = Math.round(v*100)/100;
      save('sp_overrides', OV);
      render();
    }
  });
  $('tbody').addEventListener('keydown', function(e){
    if(e.key === 'Enter' && e.target.classList.contains('ov')) e.target.blur();
  });

  $('cmpClear').addEventListener('click', function(){ CMP = []; render(); });

  document.querySelectorAll('[data-toggle]').forEach(function(h){
    h.addEventListener('click', function(){
      var p = $(h.dataset.toggle);
      p.dataset.open = p.dataset.open === '1' ? '0' : '1';
      h.querySelector('.chev').textContent = p.dataset.open === '1' ? '▾' : '▸';
    });
  });

  $('themeBtn').addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('data-theme');
    var dark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    save('sp_theme', dark ? 'light' : 'dark');
  });
  var savedTheme = load('sp_theme', null);
  if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  $('copyBtn').addEventListener('click', function(){
    var rows = window._rows || [];
    var head = ['الباركود','المنتج','العلامة','المخزون','سعر الجملة','الشحن','تكاليف أخرى','التكلفة النهائية','البيع بدون ضريبة','الضريبة','سعر البيع','الربح للوحدة','الهامش %','ربح المخزون'].join('\t');
    var body = rows.map(function(p){
      var c = p._c;
      if(c.none) return [p.g, p.n, p.b, p.s, '', '', '', '', '', '', '', '', '', ''].join('\t');
      return [p.g, p.n, p.b, p.s, c.whole, c.ship, c.other, c.landed, c.net, c.vatAmt, c.retail, c.profit, c.margin, c.stockProfit]
        .map(function(x){ return typeof x === 'number' ? x.toFixed(2).replace('.', ',') : x; }).join('\t');
    }).join('\n');
    var txt = head + '\n' + body;
    var btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function(){
      btn.textContent = '✓ نُسخ ' + rows.length + ' صفاً';
      setTimeout(function(){ btn.textContent = 'نسخ النتائج'; }, 2200);
    }).catch(function(){
      btn.textContent = 'تعذّر النسخ';
      setTimeout(function(){ btn.textContent = 'نسخ النتائج'; }, 2200);
    });
  });

  /* ---------- init ---------- */
  var brands = {};
  P.forEach(function(p){ brands[p.b] = (brands[p.b] || 0) + 1; });
  var bl = Object.keys(brands).sort();
  $('brand').innerHTML = '<option value="">كل العلامات (' + bl.length + ')</option>' +
    bl.map(function(b){ return '<option value="' + esc(b) + '">' + esc(b) + ' (' + brands[b] + ')</option>'; }).join('');
  $('hdCount').textContent = P.length;
  $('hdBrands').textContent = bl.length;
  var zero = P.filter(function(p){ return p.s <= 0; }).length;
  document.querySelector('label[for="hideOut"] .hint').textContent = zero + ' منتجاً في القائمة رصيدها صفر';

  if(window.innerWidth < 900 && !load('sp_settings', null)){ S.simple = true; $('simple').checked = true; }
  $('sort').value = state.sort;
  render();
};