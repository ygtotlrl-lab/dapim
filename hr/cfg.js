// dapim/hr/cfg.js — ההגדרה של הדף נשלפת כבר ב-head, במקביל לפריסת הדף — מהשער הציבורי (hr-pub), בלי מפתח;
// גוף בלי כותרת סוג — בלי בקשת OPTIONS מקדימה. המפתח של ההגדרה — data-key שעל תג הסקריפט.
self.FORM_CFG = (function (k) {
  var A = self.APP && self.APP.supabase; if (!A) return null;
  return fetch(A.url + '/functions/v1/hr-pub', { method: 'POST', body: JSON.stringify({ action: 'cfg', key: k }) })
    .then(function (r) { if (!r.ok) throw new Error('settings ' + r.status); return r.json(); });
})(document.currentScript.getAttribute('data-key'));
