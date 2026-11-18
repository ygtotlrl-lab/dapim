// dapim/meeting/page.js — שיבוץ לאסיפת הורים (הנהלה רוחנית)
(function(){
  var A = self.APP && self.APP.supabase;
  var IC = {
    cal:'<svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5"/></svg>',
    edit:'<svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' };
  var CLS = {a:"שיעור א'", b:"שיעור ב'", g:"שיעור ג'", s:'התלמידים השלוחים'};
  var DOW = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function $(id){return document.getElementById(id);}
  var HM = {Tishri:'תשרי',Heshvan:'חשוון',Kislev:'כסלו',Tevet:'טבת',Shevat:'שבט',Adar:'אדר','Adar I':'אדר א׳','Adar II':'אדר ב׳',Nisan:'ניסן',Iyar:'אייר',Sivan:'סיוון',Tamuz:'תמוז',Av:'אב',Elul:'אלול'};
  function heb(d){
    var o={}; new Intl.DateTimeFormat('en-u-ca-hebrew',{day:'numeric',month:'long',year:'numeric'}).formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    return {d:+o.day, m:HM[o.month]||o.month, y:+o.year};
  }
  var L1=['','א','ב','ג','ד','ה','ו','ז','ח','ט'],L10=['','י','כ','ל','מ','נ','ס','ע','פ','צ'],L100=['','ק','ר','ש','ת','תק','תר','תש','תת','תתק'];
  function gem(n){
    var s=L100[Math.floor(n/100)]+(n%100===15?'טו':n%100===16?'טז':L10[Math.floor(n%100/10)]+L1[n%10]);
    return s.length>1?s.slice(0,-1)+'״'+s.slice(-1):s+'׳';
  }
  function noon(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2],12);}
  function dayLabel(iso){var d=noon(iso),h=heb(d);return 'יום '+DOW[d.getDay()]+', '+gem(h.d)+' '+h.m+' '+gem(h.y%1000);}
  function toast(msg,bad){var t=$('toast');t.textContent=msg;t.className='toast on'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(function(){t.className='toast'+(bad?' bad':'');},2600);}
  function api(body){
    return fetch(A.url+'/functions/v1/hr-gate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {error:'bad'};});}).catch(function(){return {error:'net'};});
  }

  // ── מצב ──
  var CFG=null, ID=null, ST=null, MINE=[], TAKEN=[], BUSY=false, SF={cls:[],mgmt:[]};
  function slots(){
    var out=[], p=function(t){var a=String(t||'').split(':');return (+a[0])*60+(+a[1]||0);}, f=p(CFG.from), t=p(CFG.to), n=Math.max(5,+CFG.slot||10);
    for(var m=f;m+n<=t;m+=n) out.push(('0'+Math.floor(m/60)).slice(-2)+':'+('0'+m%60).slice(-2));
    return out;
  }
  // שעות תפוסות (הרצאות וכד׳) — לכל הרבנים
  function tmin(t){var a=String(t||'').split(':');return (+a[0])*60+(+a[1]||0);}
  function blocked(t){var m=tmin(t);return (CFG.blocked||[]).some(function(b){return b&&b.from&&b.to&&m>=tmin(b.from)&&m<tmin(b.to);});}
  // הרבנים — מהשער, לפי השיעור: רבני השיעור (חובה שניים), ואחריהם אחד מהנהלת הישיבה
  function nameOf(id){var s=SF.cls.concat(SF.mgmt).filter(function(x){return x.id===id;})[0];return s?s.name:'';}
  function isCls(id){return SF.cls.some(function(x){return x.id===id;});}
  function isMgmt(id){return SF.mgmt.some(function(x){return x.id===id;});}
  function nCls(){return MINE.filter(function(m){return isCls(m.staff);}).length;}
  // כמו בשער: עד שניים מרבני השיעור, עד אחד מההנהלה, ומי שרק בהנהלה — רק אחרי רב שיעור; מי שבשניהם — פגישה אחת, מסומנת בשניהם ונספרת ברבני השיעור
  function check(ids){
    var nc=ids.filter(isCls).length, nm=ids.filter(function(i){return isMgmt(i)&&!isCls(i);}).length;
    if(nc>2) return 'max'; if(nm>1) return 'max_mgmt';
    if(ids.some(function(i){return !isCls(i);})&&nc<1) return 'cls_first';
    return '';
  }

  function render(){
    var when=CFG.date?dayLabel(CFG.date)+' · '+esc(CFG.from)+'–'+esc(CFG.to):'';
    var html='<div class="when">'+when+'</div>';
    if(!CFG.open||!CFG.date){ $('main').innerHTML=html+'<div class="msgc"><span>השיבוץ לאסיפה סגור.</span>'+(CFG.phone?' <span>לפרטים:</span> <span dir="ltr">'+esc(CFG.phone)+'</span>':'')+'</div>'; return; }
    if(CFG.flyer) html+='<div class="flyer-w" id="flw"><span class="spin" role="status" aria-label="טוען"></span><img class="flyer" src="'+esc(CFG.flyer)+'" alt="מודעת האסיפה"></div>';
    html+=FormGate.html()+'<div id="fb"></div><div class="foot">יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד</div>';
    $('main').innerHTML=html;
    var im=document.querySelector('#flw img');
    if(im){var okf=function(){$('flw').classList.add('ok');};if(im.complete&&im.naturalWidth)okf();else{im.onload=okf;im.onerror=function(){$('flw').remove();};}}
    FormGate.mount({form:'meeting', A:A, lookup:lookup});
    preview();
  }
  // לפני מספר הזהות — כל הטופס באפור (הנעילה של form-gate.js), בלי שם התלמיד ובלי שמות הרבנים: התפקידים מאנשי הקשר
  var PV=null;
  function previewStaff(){
    if(PV) return Promise.resolve(PV);
    return fetch(A.url+'/functions/v1/hr-pub',{method:'POST',body:JSON.stringify({action:'cfg',key:'contacts'})})
      .then(function(r){return r.json();}).then(function(rows){
        var v=JSON.parse(rows[0].value), cls=[], mg=[], re=/ראש הישיבה|משגיח ראשי|מנהל הלימודים/;
        (v.groups||[]).forEach(function(g){(g.rows||[]).forEach(function(x){
          if(g.cls==='a'&&['n3','n4','n5'].indexOf(x.rp)>=0&&x.role) cls.push(x.role);
          if(x.role&&re.test(x.role)&&mg.indexOf(x.role)<0) mg.push(x.role);
        });});
        PV={cls:cls,mgmt:mg}; return PV;
      }).catch(function(){ PV={cls:['ר"מ','משפיע חסידות בוקר','משפיע חסידות ערב'],mgmt:['ראש הישיבה','משגיח ראשי','מנהל הלימודים']}; return PV; });
  }
  function preview(msg){
    previewStaff().then(function(p){
      if(ID) return;
      var ss=slots();
      function box(role){return '<div class="staff"><h3><span>'+esc(role)+'</span></h3><div class="slots">'+ss.map(function(t){return '<button type="button" disabled>'+t+'</button>';}).join('')+'</div></div>';}
      $('fb').innerHTML=(msg||'')+'<div class="pv" style="display:flex;flex-direction:column;gap:16px">'+
        '<p class="expl">אפשר לבחור עד שניים מרבני השיעור, ולכל אחד שעה פנויה. כל פגישה '+(+CFG.slot||10)+' דקות.</p>'+
        '<h2 class="sec-t">רבני השיעור · 0 מתוך 2</h2>'+p.cls.map(box).join('')+
        (p.mgmt.length?'<h2 class="sec-t">הנהלת הישיבה</h2><p class="expl">אחרי שבחרתם רב שיעור, אפשר לבחור גם פגישה אחת עם הנהלת הישיבה.</p>'+p.mgmt.map(box).join(''):'')+'</div>';
    });
  }
  // מספר הזהות — התלמיד והשיעור מהמצבה, והשיבוצים שכבר נקבעו
  async function lookup(id,kind){
    $('fb').insertAdjacentHTML('afterbegin','<div class="spin-row" id="fbw"><span class="spin" role="status" aria-label="טוען"></span></div>');
    var r=await api({action:'meet_get', id:id});
    var w=$('fbw'); if(w) w.remove();
    if(r&&r.student){ ID=id; ST=r.student; SF=r.staff||SF; MINE=r.mine||[]; TAKEN=r.taken||[]; nCls()>=1?done():pick(); return true; }
    toast(r&&r.error==='nf'?'אין תלמיד במספר זה':'אין חיבור — נסו שוב',true);
    if(r&&r.error==='nf') preview('<div class="msgc">אין תלמיד במספר זה</div>');
    return false;
  }
  function mineHTML(){
    if(!MINE.length) return '';
    return '<div class="mine-list">'+MINE.slice().sort(function(a,b){return a.time<b.time?-1:1;}).map(function(m){
      return '<div class="mine-row"><span>'+esc(nameOf(m.staff)||m.staff_name||'')+'</span><b>'+esc(m.time)+'</b></div>';}).join('')+'</div>';
  }
  function done(){
    $('fb').innerHTML='<div class="ok"><div class="c">'+IC.ok+'</div><h2>השיבוץ נקלט. נשמח לראותכם!</h2></div>'+
      '<div class="who">'+esc(ST.name)+' · '+esc(CLS[ST.cls]||'')+'</div>'+mineHTML()+
      '<div class="btns"><button class="btn" type="button" id="ics">'+IC.cal+'<span>הוספה ליומן</span></button>'+
      '<button class="btn out" type="button" id="chg">'+IC.edit+'<span>שינוי או ביטול השיבוץ</span></button></div>';
    $('ics').onclick=ics; $('chg').onclick=pick;
  }
  function pick(){
    var ss=slots(), mineBy={}; MINE.forEach(function(m){mineBy[m.staff]=m.time;});
    var myTimes=MINE.map(function(m){return m.time;}), ids=MINE.map(function(m){return m.staff;}), nc=nCls();
    function box(s, lock){
      var my=mineBy[s.id];
      return '<div class="staff'+(my?' on':'')+(lock?' lock':'')+'"><h3>'+esc(s.name)+(s.role?'<span>'+esc(s.role)+'</span>':'')+'</h3><div class="slots">'+
        ss.map(function(t){
          var taken=(blocked(t)||TAKEN.some(function(x){return x.staff===s.id&&x.time===t;}))&&my!==t;
          var clash=lock||(my!==t&&myTimes.indexOf(t)>=0);
          return '<button type="button" data-s="'+esc(s.id)+'" data-t="'+t+'"'+(my===t?' class="mine"':'')+(taken||clash?' disabled':'')+(taken?' title="שעה זו תפוסה"':'')+'>'+t+'</button>';
        }).join('')+'</div></div>';
    }
    var html='<div class="who">'+esc(ST.name)+' · '+esc(CLS[ST.cls]||'')+'</div>'+
      '<p class="expl">אפשר לבחור עד שניים מרבני השיעור, ולכל אחד שעה פנויה. כל פגישה '+(+CFG.slot||10)+' דקות.</p>'+mineHTML();
    html+='<h2 class="sec-t">רבני השיעור · '+nc+' מתוך 2</h2>';
    function lock(s){return !mineBy[s.id]&&!!check(ids.concat([s.id]));}
    SF.cls.forEach(function(s){ html+=box(s, lock(s)); });
    if(SF.mgmt.length){
      html+='<h2 class="sec-t">הנהלת הישיבה</h2><p class="expl">'+(nc<1?'אחרי שבחרתם רב שיעור, אפשר לבחור גם פגישה אחת עם הנהלת הישיבה.':'אפשר לבחור פגישה אחת עם הנהלת הישיבה.')+'</p>';
      SF.mgmt.forEach(function(s){ html+=box(s, lock(s)); });
    }
    if(nc>=1) html+='<button class="btn" type="button" id="fin">סיום</button>';
    $('fb').innerHTML=html;
    if($('fin')) $('fin').onclick=done;
  }
  // לחיצה על שעה — שיבוץ מיד; על השעה שלכם — ביטול; ושעה אחרת אצל אותו רב — החלפה
  var ERR={taken:'שעה זו כבר נתפסה', max:'ניתן לבחור עד שניים מרבני השיעור', max_mgmt:'ניתן לבחור פגישה אחת עם הנהלת הישיבה',
    cls_first:'יש לבחור קודם רב שיעור', mgmt_first:'כדי לבטל פגישה עם רב השיעור, יש לבטל קודם את הפגישה עם הנהלת הישיבה'};
  document.addEventListener('click',async function(e){
    var b=e.target.closest&&e.target.closest('.slots button'); if(!b||BUSY) return;
    var s=b.getAttribute('data-s'), t=b.getAttribute('data-t'), mine=MINE.some(function(m){return m.staff===s&&m.time===t;});
    BUSY=true; b.classList.add('busy');
    var r=await api({action:'meet_book', id:ID, staff:s, time:mine?'':t});
    BUSY=false;
    if(r&&r.mine&&!r.error){ MINE=r.mine; TAKEN=r.taken||TAKEN; pick(); if(!mine) toast('הבחירה נשמרה'); return; }
    if(r&&r.taken){ TAKEN=r.taken; }
    toast(r&&ERR[r.error]||'אין חיבור — נסו שוב',true);
    pick();
  });
  // קובץ יומן (ics) — פגישה לכל רב
  function ics(){
    var d=CFG.date.replace(/-/g,''), n=+CFG.slot||10, ev=MINE.map(function(m,i){
      var a=m.time.split(':'), st=(+a[0])*60+(+a[1]), en=st+n, f=function(x){return ('0'+Math.floor(x/60)).slice(-2)+('0'+x%60).slice(-2)+'00';};
      return 'BEGIN:VEVENT\r\nUID:'+ID+'-'+i+'@hanhala\r\nDTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z\r\nDTSTART:'+d+'T'+f(st)+'\r\nDTEND:'+d+'T'+f(en)+
        '\r\nSUMMARY:אסיפת הורים — '+(nameOf(m.staff)||'')+'\r\nLOCATION:ישיבת תומכי תמימים ראשון לציון\r\nEND:VEVENT\r\n';
    }).join('');
    var blob=new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//hanhala//meeting//HE\r\n'+ev+'END:VCALENDAR\r\n'],{type:'text/calendar'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='אסיפת הורים.ics'; document.body.appendChild(a); a.click(); a.remove();
  }

  if(!A){$('main').innerHTML='<div class="msgc">הדף אינו זמין</div>';return;}
  (self.FORM_CFG||Promise.reject(new Error('no config')))
    .then(function(rows){ var c=rows&&rows[0]?JSON.parse(rows[0].value):null; CFG=c||{open:false}; FormTexts.apply(CFG.texts); render(); })
    .catch(function(){ $('main').innerHTML='<div class="msgc">אין חיבור — נסו שוב מאוחר יותר</div>'; });
})();
