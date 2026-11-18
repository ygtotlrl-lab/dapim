// dapim/shtarot/page.js — דף השגרירים של השטרות (גיוס).
// הדף אינו נושא מפתח למסד: כל קריאה וכתיבה עוברות בשער g-gate, והקוד האישי שבקישור (אחרי #) נבדק שם בכל בקשה.
// עובד ברשת בלבד, ואינו שומר דבר במכשיר — מלבד מזהה הלשונית, לזמן שהיא פתוחה, כדי שרענון לא ינעל את האיש מפני עצמו.
(function () {
  'use strict';
  var GATE = 'https://zrftjkghhjhqzopvdzou.supabase.co/functions/v1/g-gate';
  var RETRY_MS = 2 * 60 * 60 * 1000, BEAT_MS = 60 * 1000, POLL_MS = 30 * 1000, PAGE = 60;
  var STATUS = {
    na: { l: 'לא ענה', cls: '' }, wrong: { l: 'מספר שגוי', cls: '' }, yes: { l: 'תרם', cls: 'ok' }, pl: { l: 'התחייב', cls: 'gold' },
    int: { l: 'מעוניין — לשלוח פרטים', cls: 'brand' }, cb: { l: 'לחזור אליו', cls: 'warn' },
    no: { l: 'לא מעוניין', cls: '' }, rmv: { l: 'להסיר מהרשימה', cls: 'bad' }
  };
  var GIVE = ['yes', 'pl'];
  var NO_NAME = 'שם לא ידוע';
  var ICONS = {
    call: '<path d="M6.2 3.8h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a1.6 1.6 0 0 1-1.7 1.6A16.2 16.2 0 0 1 4.6 5.5 1.6 1.6 0 0 1 6.2 3.8z"/>',
    chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.8V16A2.5 2.5 0 0 1 4 13.5z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>', prev: '<path d="M9 6l6 6-6 6"/>', next: '<path d="M15 6l-6 6 6 6"/>'
  };
  function icon(n) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  var code = decodeURIComponent(String(location.hash || '').replace(/^#/, ''));
  var dev = (function () {
    var k = 'dapim_sht_tab', v = null;
    try { v = sessionStorage.getItem(k); } catch (e) { }
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); try { sessionStorage.setItem(k, v); } catch (e) { } }
    return 'page-' + v;
  })();
  var st = { amb: '', people: [], calls: [], methods: [], q: '', f: 'queue', lim: PAGE, open: null, call: null, nav: [], busy: false };
  var ix = null, beat = 0;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function phoneShow(ph) { var d = digits(ph); return d.length === 10 && d.charAt(0) === '0' ? d.slice(0, 3) + '-' + d.slice(3) : String(ph || ''); }
  function waLink(ph) { var d = digits(ph); return 'https://wa.me/' + (d.charAt(0) === '0' ? '972' + d.slice(1) : d); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function whenShow(ms) { var d = new Date(ms); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function localInput(iso) { if (!iso) return ''; var d = new Date(iso); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function ils(n) { return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'); }
  function initials(name) { var w = String(name).trim().split(/\s+/); return (w[0].charAt(0) + (w[1] ? w[1].charAt(0) : '')); }
  function isToday(iso) { return new Date(iso).toDateString() === new Date().toDateString(); }

  var toastT = 0;
  function toast(msg, warn) {
    var box = $('#toast');
    box.innerHTML = '<div' + (warn ? ' class="warn"' : '') + '>' + esc(msg) + '</div>';
    clearTimeout(toastT); toastT = setTimeout(function () { box.innerHTML = ''; }, 3500);
  }

  function gate(body, keepalive) {
    body.code = code;
    return fetch(GATE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: !!keepalive })
      .then(function (r) { return r.json().catch(function () { return { ok: false, why: 'server' }; }); });
  }

  // ── הנגזרות — כמו במסך שבאפליקציה ──
  function callsOf(pid) {
    if (!ix) {
      ix = {};
      st.calls.forEach(function (c) { (ix[c.person_client_id] || (ix[c.person_client_id] = [])).push(c); });
      Object.keys(ix).forEach(function (k) { ix[k].sort(function (a, b) { return Date.parse(a.call_at) - Date.parse(b.call_at); }); });
    }
    return ix[pid] || [];
  }
  function personById(id) { for (var i = 0; i < st.people.length; i++) if (st.people[i].client_id === id) return st.people[i]; return null; }
  function callById(id) { for (var i = 0; i < st.calls.length; i++) if (st.calls[i].client_id === id) return st.calls[i]; return null; }
  function pState(p) {
    var cs = callsOf(p.client_id), last = cs[cs.length - 1], now = Date.now(), t;
    if (!last) return { k: 'new', rank: 1, at: 0 };
    if (last.status === 'cb') { t = last.callback_at ? Date.parse(last.callback_at) : 0; return { k: 'cb', rank: t <= now ? 0 : 3, at: t, last: last }; }
    if (last.status === 'na') { t = Date.parse(last.call_at) + RETRY_MS; return { k: 'na', rank: t <= now ? 2 : 3, at: t, last: last }; }
    return { k: 'done', rank: 9, at: Date.parse(last.call_at), last: last };
  }
  var FILTERS = {
    queue: function (s) { return s.k !== 'done'; },
    cb: function (s) { return s.k === 'cb'; },
    'new': function (s) { return s.k === 'new'; },
    na: function (s) { return s.k === 'na'; },
    done: function (s) { return s.k === 'done'; },
    mine: function (s, p) { return callsOf(p.client_id).some(function (c) { return c.ambassador === st.amb && isToday(c.call_at); }); },
    gave: function (s, p) { return callsOf(p.client_id).some(function (c) { return c.ambassador === st.amb && GIVE.indexOf(c.status) >= 0 && isToday(c.call_at); }); }
  };
  var TITLES = { queue: 'התור', cb: 'לחזור', 'new': 'טרם התקשרו', na: 'לא ענו', done: 'סיימו', mine: 'השיחות שלי היום', gave: 'התרומות שלי היום' };
  function matches() {
    var q = st.q.trim().toLowerCase(), qd = digits(q), f = FILTERS[st.f] || FILTERS.queue, rows = [];
    st.people.forEach(function (p) {
      var s = pState(p);
      if (!f(s, p)) return;
      var name = p.name || '';
      if (q && name.toLowerCase().indexOf(q) < 0 && !(qd && digits(p.phone).indexOf(qd) >= 0)) return;
      rows.push({ p: p, st: s, name: name });
    });
    return rows.sort(function (a, b) {
      if (a.st.rank !== b.st.rank) return a.st.rank - b.st.rank;
      if (a.st.rank === 9) return b.st.at - a.st.at;
      if (a.st.at !== b.st.at) return a.st.at - b.st.at;
      if (!a.name !== !b.name) return a.name ? -1 : 1;
      return a.name.localeCompare(b.name, 'he') || String(a.p.phone).localeCompare(String(b.p.phone));
    });
  }

  // ── המסך ──
  function dashHTML() {
    var n = { queue: 0, cb: 0 };
    st.people.forEach(function (p) { var s = pState(p); if (s.k !== 'done') n.queue++; if (s.k === 'cb') n.cb++; });
    var mine = st.calls.filter(function (c) { return c.ambassador === st.amb && isToday(c.call_at); });
    var gave = mine.filter(function (c) { return GIVE.indexOf(c.status) >= 0; });
    var total = gave.reduce(function (a, c) { return a + (Number(c.amount) || 0); }, 0);
    return [['queue', 'בתור', n.queue], ['cb', 'לחזור', n.cb], ['mine', 'שיחות היום', mine.length], ['gave', 'תרומות היום', gave.length, total ? ils(total) : '']].map(function (t) {
      return '<button class="k' + (st.f === t[0] ? ' on' : '') + '" data-act="filter" data-v="' + t[0] + '"><span>' + t[1] + '</span><b>' + t[2] + '</b>' + (t[3] ? '<small>' + t[3] + '</small>' : '') + '</button>';
    }).join('');
  }
  function badge(s) {
    if (s.k === 'new') return '';
    if (s.k === 'cb') return '<span class="badge warn">' + (s.at ? 'לחזור ' + esc(whenShow(s.at)) : 'לחזור') + '</span>';
    if (s.k === 'na') return '<span class="badge">' + (s.rank === 3 ? 'לא ענה · שוב ב-' + esc(whenShow(s.at).slice(6)) : 'לא ענה') + '</span>';
    var d = STATUS[s.last.status] || { l: s.last.status, cls: '' };
    return '<span class="badge ' + d.cls + '">' + esc(d.l) + '</span>';
  }
  function listHTML() {
    var list = matches();
    var h = '<h2>' + TITLES[st.f] + '<span class="cnt">' + list.length + '</span></h2>';
    if (!list.length) return h + '<div class="empty">אין כאן אף אחד כרגע</div>';
    h += list.slice(0, st.lim).map(function (r) {
      var n = callsOf(r.p.client_id).length;
      return '<button class="row' + (r.st.rank === 3 ? ' later' : '') + '" data-act="open" data-id="' + esc(r.p.client_id) + '">' +
        '<span class="av">' + (r.name ? esc(initials(r.name)) : icon('call')) + '</span>' +
        '<span class="main"><b' + (r.name ? '' : ' class="unk"') + '>' + esc(r.name || NO_NAME) + '</b><small dir="ltr">' + esc(phoneShow(r.p.phone)) + '</small>' +
          (n ? '<small> · ' + n + ' שיחות</small>' : '') + '</span>' + badge(r.st) + '</button>';
    }).join('');
    if (list.length > st.lim) h += '<div class="more"><button class="btn ghost" data-act="more">הצג עוד · ' + (list.length - st.lim) + '</button></div>';
    return h;
  }
  function viewHTML() {
    return '<section class="dash" id="dash">' + dashHTML() + '</section>' +
      '<section class="card"><input class="inp search" id="q" aria-label="חיפוש לפי שם או טלפון" placeholder="חיפוש לפי שם או טלפון" value="' + esc(st.q) + '">' +
        '<div class="seg" role="group" aria-label="סינון">' + [['queue', 'כל התור'], ['cb', 'לחזור'], ['new', 'טרם התקשרו'], ['na', 'לא ענו'], ['done', 'סיימו']].map(function (o) {
          return '<button class="' + (st.f === o[0] ? 'on' : '') + '" data-act="filter" data-v="' + o[0] + '">' + o[1] + '</button>';
        }).join('') + '</div></section>' +
      '<section class="card" id="list">' + listHTML() + '</section>';
  }
  function refresh() {
    ix = null;
    var d = $('#dash'), l = $('#list');
    if (!d || !l) { $('#view').innerHTML = viewHTML(); return; }
    d.innerHTML = dashHTML(); l.innerHTML = listHTML();
    document.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === st.f); });
  }

  // ── חלון האיש ──
  function oBtn(k, cur) {
    return '<button type="button" class="o ' + STATUS[k].cls + (cur === k ? ' on' : '') + '" aria-pressed="' + (cur === k) + '" data-act="st" data-v="' + k + '">' + esc(STATUS[k].l) + '</button>';
  }
  function cardHTML(p) {
    var cs = callsOf(p.client_id), cur = st.call ? callById(st.call) : null, s = cur ? cur.status : '', i = st.nav.indexOf(p.client_id);
    var facts = [['תרומות קודמות', p.past], ['שם במאגר', p.db_name], ['קבוצות וואטסאפ', p.wa_groups], ['מופיע במאגרים', p.sources], ['ניסה לתרום', p.tried], ['הערה', p.note]]
      .filter(function (f) { return f[1]; });
    var hist = cs.filter(function (c) { return !cur || c.client_id !== cur.client_id; }).reverse();
    var h = '<div class="band"><span class="av">' + (p.name ? esc(initials(p.name)) : icon('call')) + '</span>' +
      '<div class="who"><h3>' + esc(p.name || NO_NAME) + '</h3><span dir="ltr">' + esc(phoneShow(p.phone)) + '</span></div>' +
      '<div class="acts"><a class="ib" href="tel:' + esc(p.phone) + '" aria-label="חיוג" title="חיוג">' + icon('call') + '</a>' +
        '<a class="ib" href="' + esc(waLink(p.phone)) + '" target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" title="וואטסאפ">' + icon('chat') + '</a>' +
        '<button class="ib" data-act="close" aria-label="סגירה">' + icon('close') + '</button></div></div><div class="body">';
    if (facts.length) h += '<dl class="facts">' + facts.map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl>';
    var give = GIVE.indexOf(s) >= 0;
    h += '<div id="form"><div class="fld"><span>לא נוצר קשר</span><div class="os">' + oBtn('na', s) + oBtn('wrong', s) + '</div></div>' +
      '<div class="fld"><span>תוצאת השיחה</span><div class="os">' + ['yes', 'pl', 'int', 'cb', 'no', 'rmv'].map(function (k) { return oBtn(k, s); }).join('') + '</div></div>' +
      '<div id="give-box"' + (give ? '' : ' hidden') + '><label class="fld"><span>סכום</span><input class="inp" id="amt" inputmode="decimal" value="' + esc(cur && cur.amount != null ? cur.amount : '') + '"></label>' +
        '<div class="fld"><span>אמצעי</span><div class="os" role="radiogroup" aria-label="אמצעי">' + st.methods.map(function (m) {
          var on = !!cur && cur.method === m;
          return '<button type="button" class="o' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="method" data-v="' + esc(m) + '">' + esc(m) + '</button>';
        }).join('') + '</div></div></div>' +
      '<label class="fld" id="when-box"' + (s === 'cb' ? '' : ' hidden') + '><span>מתי לחזור</span><input class="inp" type="datetime-local" id="when" value="' + esc(cur ? localInput(cur.callback_at) : '') + '"></label>' +
      '<label class="fld"><span>סיכום השיחה</span><textarea class="inp" id="note" rows="3" placeholder="מה נאמר, מה הוסכם…">' + esc(cur ? cur.note || '' : '') + '</textarea></label>' +
      '<button class="btn save" data-act="save">' + (cur ? 'עדכון השיחה' : 'שמירת השיחה') + '</button></div>';
    if (hist.length) {
      h += '<div class="sec">שיחות קודמות<span class="cnt">' + hist.length + '</span></div><div class="hist">' + hist.map(function (c) {
        var d = STATUS[c.status] || { l: c.status, cls: '' };
        return '<div class="h"><div><span class="badge ' + d.cls + '">' + esc(d.l) + '</span> <small>' + esc(whenShow(Date.parse(c.call_at))) + ' · ' + esc(c.ambassador) + '</small></div>' +
          ((c.amount != null || c.method) ? '<div><b>' + (c.amount != null ? ils(c.amount) : '') + '</b> ' + esc(c.method || '') + '</div>' : '') +
          (c.status === 'cb' && c.callback_at ? '<div><small>לחזור ב-' + esc(whenShow(Date.parse(c.callback_at))) + '</small></div>' : '') +
          (c.note ? '<div class="hn">' + esc(c.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return h + '<div class="nav"><button class="btn ghost" data-act="step" data-d="-1"' + (i > 0 ? '' : ' disabled') + '>' + icon('prev') + 'הקודם</button>' +
      '<button class="btn" data-act="step" data-d="1"' + (i >= 0 && i < st.nav.length - 1 ? '' : ' disabled') + '>הבא' + icon('next') + '</button></div></div>';
  }
  function winDraw(top) {
    var win = $('#win'), p = st.open && personById(st.open);
    if (!p) { win.innerHTML = ''; return; }
    var inn = $('.win-in', win);
    if (inn) inn.innerHTML = cardHTML(p);
    else win.innerHTML = '<div class="win" role="dialog" aria-modal="true" aria-label="' + esc(p.name || NO_NAME) + '"><div class="win-bg" data-act="close"></div><div class="win-in">' + cardHTML(p) + '</div></div>';
    if (top) $('.win', win).scrollTop = 0;
    snap = formState();
  }

  // ── שינויים שלא נשמרו ──
  // הטופס נשמר בכפתור; יציאה ממנו כשהשתנה — שאלה: «שמירה» · «סגירה בלי שמירה», והרקע — חזרה לטופס.
  var snap = '';
  function pickedStatus() { var on = $('.o.on[data-act="st"]'); return on ? on.dataset.v : ''; }
  function formState() {
    var f = $('#form'); if (!f) return '';
    var on = $('.o.on[data-act="method"]');
    return [pickedStatus(), on ? on.dataset.v : '', ($('#amt') || {}).value, ($('#when') || {}).value, ($('#note') || {}).value].join('\u0001');
  }
  function dirty() { return !!st.open && formState() !== snap; }
  function leave(go) {
    if (!dirty()) { go(); return; }
    var box = document.createElement('div');
    box.className = 'ask';
    box.innerHTML = '<div class="ask-bg" data-ask="back"></div><div class="ask-in" role="alertdialog" aria-modal="true" aria-label="שינויים שלא נשמרו">' +
      '<h3>שינויים שלא נשמרו</h3><p>לשמור את השיחה לפני היציאה?</p>' +
      '<div class="ask-btns"><button class="btn ghost" data-ask="drop">סגירה בלי שמירה</button><button class="btn" data-ask="save">שמירה</button></div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ask]'); if (!b) return;
      box.remove();
      if (b.dataset.ask === 'drop') go();
      else if (b.dataset.ask === 'save') { var w = save(); if (w) w.then(function (ok) { if (ok) go(); }); }
    });
  }

  // ── הנעילה — בשער ──
  function beatSet() {
    clearInterval(beat); beat = 0;
    if (st.open) beat = setInterval(function () { if (st.open) gate({ a: 'beat', person: st.open, dev: dev }).catch(function () { }); }, BEAT_MS);
  }
  function release(pid, keepalive) { if (pid) gate({ a: 'release', person: pid, dev: dev }, keepalive).catch(function () { }); }
  function open(id, keepNav) {
    if (st.busy) return Promise.resolve(false);
    st.busy = true;
    if (!keepNav) st.nav = matches().map(function (r) { return r.p.client_id; });
    return gate({ a: 'open', person: id, dev: dev }).then(function (r) {
      st.busy = false;
      if (!r.ok) { toast(r.why === 'locked' ? 'האיש בשימוש אצל טלפן אחר' : 'אין חיבור — נסו שוב', true); return false; }
      if (st.open && st.open !== id) release(st.open);
      st.open = id; st.call = null; beatSet(); winDraw(true);
      return true;
    }, function () { st.busy = false; toast('אין חיבור — נסו שוב', true); return false; });
  }
  function step(d) {
    function at(j) {
      if (j < 0 || j >= st.nav.length) return Promise.resolve(false);
      if (!personById(st.nav[j])) return at(j + d);
      return open(st.nav[j], true).then(function (ok) { return ok || at(j + d); });
    }
    return at(st.nav.indexOf(st.open) + d);
  }
  function close() { release(st.open); st.open = null; st.call = null; snap = ''; beatSet(); winDraw(); refresh(); }

  // ── השיחה ──
  function save() {
    var p = personById(st.open), s = pickedStatus();
    if (!p) return null;
    if (!STATUS[s]) { toast('נא לבחור את תוצאת השיחה', true); return null; }
    var give = GIVE.indexOf(s) >= 0, a = $('#amt'), w = $('#when'), n = $('#note'), on = $('.o.on[data-act="method"]');
    var c = { amount: give && a && a.value.trim() !== '' ? Number(a.value.replace(/[^\d.]/g, '')) : null,
              method: give && on ? on.dataset.v : null,
              callback_at: s === 'cb' && w && w.value ? new Date(w.value).toISOString() : null,
              note: n && n.value.trim() ? n.value.trim() : null };
    if (c.amount != null && !(c.amount > 0)) { toast('נא להזין סכום גדול מאפס', true); return null; }
    c.status = s; c.person_client_id = p.client_id;
    c.client_id = st.call || (crypto.randomUUID ? crypto.randomUUID() : 'pg-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    return gate({ a: 'call', call: c }).then(function (r) {
      if (!r.ok || !r.call) { toast('השמירה נכשלה — נסו שוב', true); return false; }
      st.call = r.call.client_id;
      var i = st.calls.findIndex(function (x) { return x.client_id === r.call.client_id; });
      if (i >= 0) st.calls[i] = r.call; else st.calls.push(r.call);
      ix = null;
      winDraw();
      var d = $('#dash'), l = $('#list');
      if (d) d.innerHTML = dashHTML();
      if (l) l.innerHTML = listHTML();
      toast('השיחה נשמרה');
      return true;
    }, function () { toast('אין חיבור — השיחה לא נשמרה', true); return false; });
  }

  // ── המאזינים ──
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var a = el.dataset.act, cur;
    if (a === 'filter') { st.f = el.dataset.v; st.lim = PAGE; refresh(); }
    else if (a === 'more') { st.lim += PAGE * 4; refresh(); }
    else if (a === 'open') open(el.dataset.id);
    else if (a === 'close') leave(close);
    else if (a === 'step') { var d = +el.dataset.d; leave(function () { step(d); }); }
    else if (a === 'save') save();
    else if (a === 'st' || a === 'method') {
      var was = el.classList.contains('on'), grp = a === 'st' ? 'aria-pressed' : 'aria-checked';
      document.querySelectorAll('.o[data-act="' + a + '"]').forEach(function (b) { b.classList.remove('on'); b.setAttribute(grp, 'false'); });
      if (!was) { el.classList.add('on'); el.setAttribute(grp, 'true'); }
      if (a === 'st') { var v = pickedStatus(); $('#give-box').hidden = GIVE.indexOf(v) < 0; $('#when-box').hidden = v !== 'cb'; }
    }
    else if (a === 'reload') location.reload();
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { st.q = e.target.value; st.lim = PAGE; var l = $('#list'); if (l) l.innerHTML = listHTML(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open && !$('.ask')) leave(close); });
  window.addEventListener('pagehide', function () { if (st.open) release(st.open, true); });

  function fail(title, text, retry) {
    $('#view').innerHTML = '<div class="msg"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>' +
      (retry ? '<button class="btn" data-act="reload">ניסיון נוסף</button>' : '') + '</div>';
  }

  // ── עלייה ──
  if (!code) { fail('הקישור אינו שלם', 'נא לפתוח את הקישור האישי שקיבלתם.'); return; }
  gate({ a: 'load' }).then(function (r) {
    if (!r.ok) {
      if (r.why === 'code') fail('הקישור אינו בתוקף', 'נא לבקש קישור חדש.');
      else fail('הטעינה נכשלה', 'נא לבדוק את החיבור לאינטרנט.', true);
      return;
    }
    st.amb = r.amb; st.people = r.people; st.calls = r.calls; st.methods = r.methods || [];
    $('#amb').textContent = r.amb;
    $('#view').innerHTML = viewHTML();
    // השיחות מתרעננות ברקע — מה שטלפנים אחרים רשמו נכנס לתור בלי רענון הדף.
    setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      gate({ a: 'calls' }).then(function (x) {
        if (!x.ok) return;
        st.calls = x.calls; ix = null;
        var d = $('#dash'), l = $('#list');
        if (d) d.innerHTML = dashHTML();
        if (l) l.innerHTML = listHTML();
      }).catch(function () { });
    }, POLL_MS);
  }, function () { fail('הטעינה נכשלה', 'נא לבדוק את החיבור לאינטרנט.', true); });
})();
