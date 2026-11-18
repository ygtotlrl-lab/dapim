// dapim/intake/page.js — קבלה לישיבה (הנהלה רוחנית)
(function(){
  var A = self.APP && self.APP.supabase;
  var IC = {
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function $(id){return document.getElementById(id);}

  // ── הלוח העברי (Intl) — כמו בטופס הרישום ──
  var HM = {Tishri:'תשרי',Heshvan:'חשוון',Kislev:'כסלו',Tevet:'טבת',Shevat:'שבט',Adar:'אדר','Adar I':'אדר א׳','Adar II':'אדר ב׳',Nisan:'ניסן',Iyar:'אייר',Sivan:'סיוון',Tamuz:'תמוז',Av:'אב',Elul:'אלול'};
  function heb(d){
    var o={}; new Intl.DateTimeFormat('en-u-ca-hebrew',{day:'numeric',month:'long',year:'numeric'}).formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    return {d:+o.day, m:HM[o.month]||o.month, y:+o.year};
  }
  function leap(y){return ((7*y+1)%19)<7;}
  function months(y){return ['תשרי','חשוון','כסלו','טבת','שבט'].concat(leap(y)?['אדר א׳','אדר ב׳']:['אדר'],['ניסן','אייר','סיוון','תמוז','אב','אלול']);}
  var L1=['','א','ב','ג','ד','ה','ו','ז','ח','ט'],L10=['','י','כ','ל','מ','נ','ס','ע','פ','צ'],L100=['','ק','ר','ש','ת','תק','תר','תש','תת','תתק'];
  function gem(n){
    var s=L100[Math.floor(n/100)]+(n%100===15?'טו':n%100===16?'טז':L10[Math.floor(n%100/10)]+L1[n%10]);
    return s.length>1?s.slice(0,-1)+'״'+s.slice(-1):s+'׳';
  }
  function hebLabel(h){return gem(h.d)+' '+h.m+' '+gem(h.y%1000);}
  function noon(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2],12);}
  function addDay(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;}
  function same(a,b){return a.d===b.d&&a.m===b.m&&a.y===b.y;}
  function gLabel(s){var p=s.split('-');return (+p[2])+'.'+(+p[1])+'.'+p[0];}
  // שנת הלימודים שהקבלה אליה — זו שנפתחת בזמן אלול הקרוב: השנה העברית הבאה (ובאלול עצמו — זו שנפתחה בו)
  var TODAY=heb(new Date()), YEAR=TODAY.y+1;

  // ── מצב ──
  var CFG=null, V={}, FILES={}, UP={}, RID=null, IDF=null, IDKIND='id', SIGS={}, SUNSET=false, DATES_OK=false;

  function toast(msg,bad){var t=$('toast');t.textContent=msg;t.className='toast on'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(function(){t.className='toast'+(bad?' bad':'');},2600);}
  function dlg(html){$('bx').innerHTML=html;$('veil').classList.add('open');}
  function dlgClose(){$('veil').classList.remove('open');}

  // ── השדות — אותם סוגים ואותה צורה כמו בטופס הרישום ──
  function fieldHTML(f){
    var req=f.req?' <span class="q">*</span>':'', help=f.help?'<small>'+esc(f.help)+'</small>':'';
    var head='<span class="t">'+esc(f.label)+req+'</span>'+help, body='';
    if(f.type==='select'&&f.lead&&(f.options||[]).length>1){
      var o0=f.options[0];
      body='<div class="chips lead" data-chips="'+f.id+'"><button type="button" class="pri" data-v="'+esc(o0)+'">'+esc(o0)+'</button>'+
        '<details><summary>אפשרות אחרת</summary><div>'+f.options.slice(1).map(function(o){return '<button type="button" data-v="'+esc(o)+'">'+esc(o)+'</button>';}).join('')+'</div></details></div>';
    }
    else if(f.type==='select') body='<div class="chips" data-chips="'+f.id+'">'+(f.options||[]).map(function(o){return '<button type="button" data-v="'+esc(o)+'">'+esc(o)+'</button>';}).join('')+'</div>';
    else if(f.type==='textarea') body='<textarea class="in" data-id="'+f.id+'"></textarea>';
    else if(f.type==='hebdate') body='<button type="button" class="pick" data-hpick="'+f.id+'"><span class="e">בחירה</span>'+IC.cal+'</button>';
    else if(f.type==='gdate') body='<label class="pick"><span class="e" data-gshow="'+f.id+'">בחירה</span>'+IC.cal+'<input type="date" data-id="'+f.id+'" max="'+new Date().toISOString().slice(0,10)+'"></label>';
    else if(f.type==='file') body='<div class="up-pick"><label class="up">＋ העלאת קובץ<input type="file" accept="image/*,application/pdf" data-file="'+f.id+'"></label>'+
      '<button type="button" class="up up-cam" data-cam="'+f.id+'">'+(window.Capture?Capture.icon:'')+'<span>צילום</span></button></div><span class="nm up-nm" data-fname="'+f.id+'"></span>';
    else if(f.type==='consent') return '<div class="f" data-f="'+f.id+'">'+(f.help?'<div class="chk-h">'+esc(f.help)+'</div>':'')+'<label class="chk"><input type="checkbox" data-id="'+f.id+'"><span>'+esc(f.label)+req+'</span></label><span class="msg">שדה חובה</span></div>';
    // חתימה באצבע — נשמרת כתמונה עם הקבצים שהועלו
    else if(f.type==='signature') body='<div class="sig" data-sig="'+f.id+'"><canvas></canvas><span class="ph">יש לחתום כאן באצבע</span><button type="button" data-sigclr="'+f.id+'">ניקוי</button></div>';
    else {
      var tp=f.type==='email'?'email':f.type==='tel'?'tel':'text', im=f.type==='tel'||f.type==='idnum'?' inputmode="numeric"':'';
      body='<input class="in" type="'+tp+'"'+im+(tp!=='text'||f.type==='idnum'?' dir="ltr"':'')+' data-id="'+f.id+'" autocomplete="off">';
    }
    return '<div class="f" data-f="'+f.id+'">'+head+body+'<span class="msg">שדה חובה</span></div>';
  }
  // «צפייה במסמך» — רק כשיש למסמך קובץ או קישור
  function viewBtn(url,title){return url?'<a class="dv" href="'+esc(url)+'" data-pv="'+esc(title||'')+'" target="_blank" rel="noopener">'+IC.eye+'צפייה במסמך</a>':'';}
  // המסמך נפתח בתוך הדף, בעמודים (pdf.js) — חלון חדש אינו נפתח בתוך האפליקציה המותקנת
  var PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
  async function pdfView(url,title){
    $('pv-t').textContent=title||'';var b=$('pv-b');b.innerHTML='<div class="ld">טוען…</div>';$('pv').classList.add('open');
    try{
      if(!window.pdfjsLib){await loadScript(PDFJS+'build/pdf.min.js');window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'build/pdf.worker.min.js';}
      var doc=await window.pdfjsLib.getDocument({url:url,cMapUrl:PDFJS+'cmaps/',cMapPacked:true,standardFontDataUrl:PDFJS+'standard_fonts/',disableFontFace:true}).promise;b.innerHTML='';
      var w=Math.min(b.clientWidth-24,1000),dpr=Math.min(window.devicePixelRatio||1,2);
      for(var n=1;n<=doc.numPages;n++){
        if(!$('pv').classList.contains('open'))return;
        var pg=await doc.getPage(n),v0=pg.getViewport({scale:1}),vp=pg.getViewport({scale:w/v0.width*dpr});
        var c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;c.style.width=Math.round(vp.width/dpr)+'px';b.appendChild(c);
        await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      }
    }catch(e){console.warn('[intake] צפייה נכשלה',e);b.innerHTML='<div class="ld">פתיחת המסמך נכשלה</div>';}
  }
  function render(){
    // «פתוח לרישום» / «פתוח לחתימה» כבוי בהגדרות — הודעה במקום הטופס; בלי הסימון (תצורה ישנה) — פתוח
    if(CFG.open===false){$('main').innerHTML='<div class="msgc">הטופס סגור כעת.</div>';return;}
    var html='<p class="req-note">השדות המסומנים ב-* הם חובה.</p>';
    // מספר הזהות — ראשון, ושאר הטופס נעול עד שממלאים אותו (form-gate.js)
    var idf=(CFG.fields||[]).filter(function(f){return f.type==='idnum';})[0]; IDF=idf?idf.id:null;
    if(IDF) html+=FormGate.html()+'<div id="fb">';
    var n=0, open=false;
    (CFG.fields||[]).forEach(function(f){
      if(f.id===IDF) return;
      if(f.type==='section'){ if(open) html+='</section>'; n++; html+='<section class="sec"><h2><b>'+n+'</b>'+esc(f.label)+'</h2>'; open=true; return; }
      if(!open){ html+='<section class="sec">'; open=true; }
      html+=fieldHTML(f);
    });
    if(open) html+='</section>';
    var docs=CFG.docs||[];
    if(docs.length){
      n++; html+='<section class="sec"><h2><b>'+n+'</b>מסמכים לצפייה</h2>'+
        docs.map(function(d){return '<div class="doc"><span class="dt">'+esc(d.title)+'</span>'+viewBtn(d.url,d.title)+'</div>';}).join('')+'</section>';
    }
    var items=CFG.items||[];
    if(items.length){
      n++; html+='<section class="sec"><h2><b>'+n+'</b>מסמכים לחתימה</h2>'+
        items.map(function(it,i){
          // פריט מוקפא — באפור, בלי שדות ובלי חובה, עד שמפשירים
          if(it.frozen) return '<div class="it frz"><h3><i>'+(i+1)+'.</i>'+esc(it.title)+'<em>בהמשך</em></h3></div>';
          return '<div class="it"><h3><i>'+(i+1)+'.</i>'+esc(it.title)+'</h3>'+viewBtn(it.doc,it.title)+
            (it.fields||[]).filter(function(f){return f.type!=='section';}).map(fieldHTML).join('')+'</div>';
        }).join('')+'</section>';
    }
    if(CFG.privacy) html+='<p class="priv">'+esc(CFG.privacy)+'</p>';
    html+='<button class="btn" id="send" type="button">שליחת הטופס</button>'+(IDF?FormGate.savedNote()+'</div>':'')+'<div class="foot">יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד</div>';
    $('main').innerHTML=html;
    document.querySelectorAll('[data-sig]').forEach(sigInit);
    if(IDF) FormGate.mount({form:'intake', A:A,
      state:function(){return {V:V, UP:UP, RID:RID, SUNSET:SUNSET, DATES_OK:DATES_OK};},
      restore:function(d){V=d.V||{};UP=d.UP||{};RID=d.RID||null;SUNSET=!!d.SUNSET;DATES_OK=!!d.DATES_OK;fillDom();},
      onOpen:function(id,kind){V[IDF]=id;IDKIND=kind;if(!RID)RID=cid();},
      onReset:function(){var id=V[IDF];V={};UP={};FILES={};SIGS={};SUNSET=false;DATES_OK=false;V[IDF]=id;RID=cid();fillDom();
        document.querySelectorAll('[data-sig]').forEach(function(b){if(b._clr)b._clr();});}});
  }
  // הטיוטה שנטענה — לתוך השדות שבמסך (חתימה אינה נשמרת בטיוטה — חותמים בשליחה)
  function fillDom(){
    allFields().forEach(function(f){
      if(f.id===IDF||f.type==='signature') return;
      var v=V[f.id];
      if(f.type==='select'){var box=document.querySelector('[data-chips="'+f.id+'"]');if(box)box.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',v!=null&&x.getAttribute('data-v')===v);});return;}
      if(f.type==='hebdate'){var b=document.querySelector('[data-hpick="'+f.id+'"] span');if(b){b.className=v?'v':'e';b.textContent=v?hebLabel(v):'בחירה';}return;}
      if(f.type==='file'){var nm=document.querySelector('[data-fname="'+f.id+'"]');if(nm)nm.textContent=UP[f.id]?UP[f.id].name:'';return;}
      var el=document.querySelector('[data-id="'+f.id+'"]'); if(!el) return;
      if(f.type==='consent'){el.checked=!!v;return;}
      if(f.type==='gdate'){el.value=v||'';var g=document.querySelector('[data-gshow="'+f.id+'"]');if(g){g.className=v?'v':'e';g.textContent=v?gLabel(v):'בחירה';}return;}
      el.value=v==null?'':v;
    });
  }
  // ── חתימה — ציור בקנבס, ובסוף כל משיכה התמונה נשמרת כקובץ (PNG) ──
  function sigInit(box){
    var id=box.getAttribute('data-sig'), cv=box.querySelector('canvas'), ctx, last=null;
    function size(){var r=box.getBoundingClientRect(),k=window.devicePixelRatio||1;cv.width=r.width*k;cv.height=r.height*k;ctx=cv.getContext('2d');ctx.scale(k,k);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#0f2347';}
    size();
    function pt(e){var r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
    cv.addEventListener('pointerdown',function(e){e.preventDefault();cv.setPointerCapture(e.pointerId);last=pt(e);ctx.beginPath();ctx.arc(last.x,last.y,1.1,0,7);ctx.fillStyle='#0f2347';ctx.fill();});
    cv.addEventListener('pointermove',function(e){if(!last)return;var p=pt(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;});
    function end(){if(!last)return;last=null;box.classList.add('has');cv.toBlob(function(b){FILES[id]=new File([b],'חתימה.png',{type:'image/png'});SIGS[id]=cv.toDataURL('image/png');clearErr(id);},'image/png');}
    cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
    box._clr=function(){ctx.clearRect(0,0,cv.width,cv.height);box.classList.remove('has');FILES[id]=null;delete SIGS[id];};
  }
  // כל השדות שממלאים — פרטי התלמיד ואחריהם שדות המסמכים לחתימה
  function allFields(){
    var out=(CFG.fields||[]).filter(function(f){return f.type!=='section';});
    (CFG.items||[]).forEach(function(it){if(!it.frozen)(it.fields||[]).forEach(function(f){if(f.type!=='section')out.push(f);});});
    return out;
  }
  function fdef(id){return allFields().filter(function(f){return f.id===id;})[0];}
  function byType(t){return allFields().filter(function(f){return f.type===t;})[0];}

  // ── בורר התאריך העברי וההצלבה — כמו בטופס הרישום ──
  var HY_FIRST=5765, HY_LAST=5795;
  function hpick(id){
    var cur=V[id]||{d:1,m:'תשרי',y:TODAY.y-14}, ys=[];
    for(var y=HY_LAST;y>=HY_FIRST;y--) ys.push(y); // תשס״ה עד תשצ״ה
    function opts(list,sel,lab){return list.map(function(v){return '<option value="'+esc(v)+'"'+(v==sel?' selected':'')+'>'+esc(lab?lab(v):v)+'</option>';}).join('');}
    function days(){var a=[];for(var i=1;i<=30;i++)a.push(i);return a;}
    dlg('<h3>'+esc(fdef(id).label)+'</h3><div class="sels">'+
      '<select id="hd">'+opts(days(),cur.d,gem)+'</select>'+
      '<select id="hm">'+opts(months(cur.y),cur.m)+'</select>'+
      '<select id="hy">'+opts(ys,cur.y,function(y){return gem(y%1000);})+'</select></div>'+
      '<div class="row2"><button class="btn out" type="button" data-close>ביטול</button><button class="btn" type="button" data-hok="'+id+'">אישור</button></div>');
    $('hy').onchange=function(){var m=$('hm').value,ms=months(+this.value);if(ms.indexOf(m)<0)m=ms.indexOf('אדר')<0?'אדר א׳':'אדר';$('hm').innerHTML=opts(ms,m);};
  }
  function hpickOk(id){
    V[id]={d:+$('hd').value,m:$('hm').value,y:+$('hy').value};
    var b=document.querySelector('[data-hpick="'+id+'"]'); b.querySelector('span').className='v'; b.querySelector('span').textContent=hebLabel(V[id]);
    dlgClose(); clearErr(id); SUNSET=false; checkDates();
  }
  function checkDates(){
    var hf=byType('hebdate'), gf=byType('gdate'); DATES_OK=false;
    if(!hf||!gf||!V[hf.id]||!V[gf.id]) return;
    var h=V[hf.id], g=noon(V[gf.id]), hg=heb(g), hn=heb(addDay(g,1));
    if(same(h,hg)){ DATES_OK=true; SUNSET=false; toast('שני התאריכים תואמים'); return; }
    var cmp='<div class="cmp">תאריך עברי שנבחר: <b>'+hebLabel(h)+'</b><br>תאריך לועזי שנבחר: <b>'+gLabel(V[gf.id])+'</b> (= <b>'+hebLabel(hg)+'</b>)</div>';
    if(same(h,hn)) dlg('<h3>הפרש של יום אחד</h3><p>התאריך העברי מאוחר ביום אחד מהתאריך הלועזי. כך זה כשהתלמיד נולד בערב, אחרי השקיעה — אז כבר מתחיל היום העברי הבא.</p>'+cmp+
      '<label class="chk"><input type="checkbox" id="sun"><span><b style="color:var(--text)">התלמיד נולד אחרי השקיעה</b></span></label>'+
      '<div class="row2"><button class="btn out" type="button" data-close>חזרה לתיקון</button><button class="btn" type="button" data-sunok>אישור</button></div>');
    else dlg('<h3>התאריכים אינם תואמים</h3><p>התאריך העברי שנבחר אינו מתאים לתאריך הלועזי. נא לבדוק את שניהם.</p>'+cmp+'<button class="btn" type="button" data-close>חזרה לתיקון</button>');
  }

  // ── בדיקה ושליחה ──
  function clearErr(id){var f=document.querySelector('[data-f="'+id+'"]');if(f)f.classList.remove('err');}
  function setErr(id,msg){var f=document.querySelector('[data-f="'+id+'"]');if(!f)return;f.classList.add('err');if(msg)f.querySelector('.msg').textContent=msg;}
  function collect(){
    var bad=null;
    allFields().forEach(function(f){
      var v=V[f.id], empty=(f.type==='file')?!(UP[f.id]||FILES[f.id]):(f.type==='signature')?!FILES[f.id]:(f.type==='consent')?!v:(v==null||String(typeof v==='object'?'x':v).trim()==='');
      if(f.req&&empty){setErr(f.id,'שדה חובה');bad=bad||f.id;return;}
      if(!empty&&f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())){setErr(f.id,'כתובת אימייל אינה תקינה');bad=bad||f.id;}
    });
    var hf=byType('hebdate'),gf=byType('gdate');
    if(!bad&&hf&&gf&&V[hf.id]&&V[gf.id]&&!DATES_OK){checkDates();return 'dates';}
    if(bad){var el=document.querySelector('[data-f="'+bad+'"]');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});toast('יש למלא את השדות המסומנים',true);}
    return bad;
  }
  function cid(){var a=new Uint8Array(8);crypto.getRandomValues(a);return Array.prototype.map.call(a,function(b){return (b+256).toString(16).slice(1);}).join('');}
  function hdrs(x){return x||{};}
  async function send(){
    if(collect()) return;
    var b=$('send'); b.disabled=true; b.textContent='שולח…';
    var id=RID||cid(), files={};
    try{
      for(var k0 in UP) if(UP[k0]) files[k0]=UP[k0];
      for(var k in FILES){
        var file=FILES[k]; if(!file||files[k]) continue;
        var ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
        var path='intake/'+YEAR+'/'+id+'/'+k+'.'+ext;
        var r=await fetch(A.url+'/functions/v1/hr-gate?a=put&p='+encodeURIComponent(path),{method:'POST',headers:hdrs({'Content-Type':file.type||'application/octet-stream'}),body:file});
        if(!r.ok) throw new Error('upload '+r.status);
        files[k]={path:path,name:file.name};
      }
      var data={};
      allFields().forEach(function(f){
        if(f.type==='file'||f.type==='signature') return;
        var v=V[f.id]; if(v==null||v==='') return;
        data[f.id]=f.type==='hebdate'?hebLabel(v):f.type==='gdate'?gLabel(v):f.type==='consent'?'מאשר':String(v).trim();
      });
      if(IDF&&IDKIND==='pp') data._idtype='דרכון';
      if(SUNSET) data._sunset='נולד אחרי השקיעה';
      var row={client_id:id,school_year:YEAR,data:data,files:files,updated_at:Date.now()};
      var r2=await fetch(A.url+'/functions/v1/hr-pub',{method:'POST',body:JSON.stringify({action:'submit',form:'intake',row:row})});
      if(!r2.ok) throw new Error('insert '+r2.status);
      if(IDF) FormGate.drop();
      done(id,data,files);
    }catch(e){
      console.warn('[intake] השליחה נכשלה',e);
      b.disabled=false; b.textContent='שליחת הטופס';
      toast('השליחה נכשלה — נא לנסות שוב',true);
    }
  }
  function done(id,data,files){
    var name=[data.first,data.last].filter(Boolean).join(' ');
    $('main').innerHTML='<div class="ok"><div class="c">'+IC.ok+'</div><h2>תודה רבה!</h2><p>המסמכים נשלחו בהצלחה</p><p>נתראה בעזרת השם בתחילת זמן אלול</p></div>'+
      '<button class="btn" id="pdf" type="button">הורדת העתק הטופס (PDF)</button><div class="foot">יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד</div>';
    window.scrollTo(0,0);
    $('pdf').onclick=function(){copyPdf(id,data,files,name);};
  }

  // ── ההעתק לממלא: קובץ PDF אחד — דף התשובות (מצולם, html2canvas), ואחריו הקבצים שהועלו והמסמכים לצפייה ולחתימה (pdf-lib).
  //    קובץ שאינו PDF או תמונה שהדפדפן מצייר (למשל HEIC), ומסמך שלא נטען — מדולג; הקישור לדף אנשי הקשר אינו מסמך ואינו נכנס.
  function loadScript(src){return new Promise(function(ok,no){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
  var A4=[595.28,841.89];
  function blobImg(blob){return new Promise(function(ok,no){var u=URL.createObjectURL(blob),im=new Image();im.onload=function(){ok(im);};im.onerror=function(){URL.revokeObjectURL(u);no(new Error('img'));};im.src=u;});}
  async function addImagePage(pdf,blob){
    var bytes=new Uint8Array(await blob.arrayBuffer()), img;
    if(/png/.test(blob.type)) img=await pdf.embedPng(bytes);
    else if(/jpe?g/.test(blob.type)) img=await pdf.embedJpg(bytes);
    else { var im=await blobImg(blob), c=document.createElement('canvas'); c.width=im.naturalWidth; c.height=im.naturalHeight; c.getContext('2d').drawImage(im,0,0);
      img=await pdf.embedJpg(await (await fetch(c.toDataURL('image/jpeg',.9))).arrayBuffer()); }
    var m=28, s=Math.min((A4[0]-2*m)/img.width,(A4[1]-2*m)/img.height,1), w=img.width*s, h=img.height*s;
    pdf.addPage(A4).drawImage(img,{x:(A4[0]-w)/2,y:(A4[1]-h)/2,width:w,height:h});
  }
  async function addBlob(pdf,blob,name){
    try{
      var t=blob.type||'', pdfy=/pdf/.test(t)||/\.pdf$/i.test(name||'');
      if(pdfy){
        var src=await PDFLib.PDFDocument.load(new Uint8Array(await blob.arrayBuffer()),{ignoreEncryption:true});
        (await pdf.copyPages(src,src.getPageIndices())).forEach(function(p){pdf.addPage(p);});
      } else if(/^image\//.test(t)) await addImagePage(pdf,blob);
    }catch(e){ console.warn('[intake] קובץ לא צורף להעתק',name,e); }
  }
  async function copyPdf(id,data,files,name){
    var b=$('pdf'); b.disabled=true; b.textContent='מכין את הקובץ…';
    try{
      if(!window.html2canvas) await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      if(!window.PDFLib) await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
      var now=new Date(), rows='';
      function row(f){
        if(f.type==='signature') return '<tr><th>'+esc(f.label)+'</th><td>'+(SIGS[f.id]?'<img class="sg" src="'+SIGS[f.id]+'" alt="">':'')+'</td></tr>';
        var v=f.type==='file'?(files[f.id]?files[f.id].name:''):(data[f.id]||'');
        if(f.type==='hebdate'&&data._sunset) v+=' ('+data._sunset+')';
        return '<tr><th>'+esc(f.label)+'</th><td>'+esc(v)+'</td></tr>';
      }
      (CFG.fields||[]).forEach(function(f){ rows+=f.type==='section'?'<tr class="sh"><th colspan="2">'+esc(f.label)+'</th></tr>':row(f); });
      if((CFG.items||[]).length){
        rows+='<tr class="sh"><th colspan="2">מסמכים לחתימה</th></tr>';
        CFG.items.forEach(function(it,i){
          if(it.frozen) return;
          rows+='<tr class="it-h"><th colspan="2">'+(i+1)+'. '+esc(it.title)+'</th></tr>';
          (it.fields||[]).forEach(function(f){ if(f.type!=='section') rows+=row(f); });
        });
      }
      var c=$('copy');
      c.innerHTML='<div class="hd"><img src="../hr/logo-white.png" alt=""><div><h1>קבלה לישיבה</h1><div>ישיבת תומכי תמימים ראשון לציון</div></div></div>'+
        '<div class="meta"><span>'+gem(YEAR%1000)+'</span><span>נשלח: '+now.toLocaleDateString('he-IL')+' '+now.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'})+' · אסמכתא '+id.slice(0,8).toUpperCase()+'</span></div>'+
        '<table>'+rows+'</table>';
      var canvas=await html2canvas(c,{scale:2,backgroundColor:'#ffffff',logging:false});
      var pdf=await PDFLib.PDFDocument.create();
      var ph=Math.floor(canvas.width*A4[1]/A4[0]), y=0;
      while(y<canvas.height){
        var part=document.createElement('canvas'); part.width=canvas.width; part.height=Math.min(ph,canvas.height-y);
        part.getContext('2d').drawImage(canvas,0,y,canvas.width,part.height,0,0,canvas.width,part.height);
        var jpg=await pdf.embedJpg(await (await fetch(part.toDataURL('image/jpeg',.92))).arrayBuffer());
        pdf.addPage(A4).drawImage(jpg,{x:0,y:A4[1]-part.height*A4[0]/canvas.width,width:A4[0],height:part.height*A4[0]/canvas.width});
        y+=ph;
      }
      // הקבצים שהועלו, בסדר השדות
      for(var i=0, fl=allFields(); i<fl.length; i++) if(fl[i].type==='file'&&FILES[fl[i].id]) await addBlob(pdf,FILES[fl[i].id],FILES[fl[i].id].name);
      // המסמכים לצפייה ואחריהם המסמכים לחתימה — מה שיש לו קובץ
      var urls=(CFG.docs||[]).filter(function(d){return d.url;}).map(function(d){return d.url;})
        .concat((CFG.items||[]).filter(function(it){return it.doc&&!it.frozen;}).map(function(it){return it.doc;}));
      for(var j=0;j<urls.length;j++){
        try{ var r=await fetch(urls[j]); if(r.ok) await addBlob(pdf,await r.blob(),urls[j]); }catch(e){ console.warn('[intake] מסמך לא נטען להעתק',urls[j],e); }
      }
      var out=await pdf.save(), a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([out],{type:'application/pdf'}));
      a.download='קבלה לישיבה — '+(name||'העתק')+'.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    }catch(e){ console.warn('[intake] ההעתק נכשל',e); toast('הכנת הקובץ נכשלה — נא לנסות שוב',true); }
    b.disabled=false; b.textContent='הורדת העתק הטופס (PDF)';
  }

  // ── האזנה אחת לכל אירוע, בהאצלה ──
  // קובץ שנבחר או צולם — נשמר ב-FILES ושמו מוצג מתחת לשני הכפתורים
  function setFile(fk,file,label){FILES[fk]=file||null;delete UP[fk];document.querySelector('[data-fname="'+fk+'"]').textContent=file?(label||file.name):'';if(file){clearErr(fk);if(IDF)upNow(fk,file,label);}}
  // קובץ עולה מיד לטיוטה — כך הוא נשאר גם כשיוצאים וחוזרים
  async function upNow(fk,file,label){
    var nm=document.querySelector('[data-fname="'+fk+'"]');
    try{
      var orig=file;
      if(window.Capture&&!file.pages) file=await Capture.compress(file);
      if(FILES[fk]!==orig) return;
      FILES[fk]=file;
      var ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
      var path='intake/'+YEAR+'/'+RID+'/'+fk+'-'+Date.now()+'.'+ext;
      var r=await fetch(A.url+'/functions/v1/hr-gate?a=put&p='+encodeURIComponent(path),{method:'POST',headers:hdrs({'Content-Type':file.type||'application/octet-stream'}),body:file});
      if(!r.ok) throw new Error('upload '+r.status);
      UP[fk]={path:path,name:label||file.name}; FormGate.save();
    }catch(e){console.warn('[intake] ההעלאה נכשלה',e);toast('העלאת הקובץ נכשלה — נא לנסות שוב',true);if(nm)nm.textContent='';FILES[fk]=null;}
  }
  document.addEventListener('click',function(e){
    var t=e.target;
    var cam=t.closest('[data-cam]'); if(cam&&window.Capture){var ck=cam.getAttribute('data-cam');Capture.camera({title:'צילום מסמך',name:'צילום'}).then(function(file){if(file)setFile(ck,file,'צילום · '+(file.pages===1?'עמוד אחד':file.pages+' עמודים'));});return;}
    var pv=t.closest('[data-pv]'); if(pv){e.preventDefault();pdfView(pv.getAttribute('href'),pv.getAttribute('data-pv'));return;}
    if(t.closest('[data-pvx]')){$('pv').classList.remove('open');$('pv-b').innerHTML='';return;}
    var ch=t.closest('[data-chips] button'); if(ch){var box=ch.closest('[data-chips]'),id=box.getAttribute('data-chips');box.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===ch);});V[id]=ch.getAttribute('data-v');clearErr(id);return;}
    var hp=t.closest('[data-hpick]'); if(hp){hpick(hp.getAttribute('data-hpick'));return;}
    var ho=t.closest('[data-hok]'); if(ho){hpickOk(ho.getAttribute('data-hok'));return;}
    if(t.closest('[data-sunok]')){ if(!$('sun').checked){toast('יש לסמן את התיבה, או לחזור לתיקון',true);return;} SUNSET=true;DATES_OK=true;dlgClose();toast('נשמר: נולד אחרי השקיעה');return;}
    if(t.closest('[data-close]')||t===$('veil')){dlgClose();return;}
    var sc=t.closest('[data-sigclr]'); if(sc){var bx=document.querySelector('[data-sig="'+sc.getAttribute('data-sigclr')+'"]');if(bx&&bx._clr)bx._clr();return;}
    if(t.closest('#send')){send();return;}
  });
  document.addEventListener('input',function(e){var id=e.target.getAttribute&&e.target.getAttribute('data-id');if(id&&e.target.type!=='checkbox'&&e.target.type!=='date'){V[id]=e.target.value;clearErr(id);}});
  document.addEventListener('change',function(e){
    var t=e.target, id=t.getAttribute('data-id'), fk=t.getAttribute('data-file');
    if(fk){var raw=t.files&&t.files[0]||null;setFile(fk,raw);if(!IDF&&raw&&window.Capture)Capture.compress(raw).then(function(c){if(FILES[fk]===raw)FILES[fk]=c;});return;}
    if(!id) return;
    if(t.type==='checkbox'){V[id]=t.checked;clearErr(id);return;}
    if(t.type==='date'){V[id]=t.value||null;var s=document.querySelector('[data-gshow="'+id+'"]');s.className=t.value?'v':'e';s.textContent=t.value?gLabel(t.value):'בחירה';clearErr(id);SUNSET=false;checkDates();}
  });

  if(!A){$('main').innerHTML='<div class="msgc">הטופס אינו זמין</div>';return;}
  // ההגדרה האחרונה שנשמרה במכשיר (IndexedDB) מציירת את הטופס כשנקראה; החדשה מחליפה אותה כשהגיעה — אם השתנתה ועוד לא התחילו למלא.
  try{localStorage.removeItem('hr_cache_enroll_form');localStorage.removeItem('hr_cache_intake_form');}catch(e){}
  var KEY='intake_form', shown=null, fresh=false;
  function cfgOk(c){return !!(c&&Array.isArray(c.fields));}
  // מסד קטן לדפים הציבוריים, רשומה אחת לטופס; כל כשל — null, והטופס נטען מהרשת
  function idb(mode,op){
    return new Promise(function(res){
      try{
        var o=indexedDB.open('hr-public',1);
        o.onupgradeneeded=function(){o.result.createObjectStore('cfg');};
        o.onerror=o.onblocked=function(){res(null);};
        o.onsuccess=function(){
          try{var db=o.result, tx=db.transaction('cfg',mode), rq=op(tx.objectStore('cfg'));
            tx.oncomplete=function(){db.close();res(rq.result);};
            tx.onerror=tx.onabort=function(){db.close();res(null);};
          }catch(e){res(null);}
        };
      }catch(e){res(null);}
    });
  }
  function show(j){
    if(j===shown) return;
    if(shown&&(Object.keys(V).length||Object.keys(FILES).length)) return;
    CFG=JSON.parse(j); FormTexts.apply(CFG.texts); render(); shown=j;
  }
  var cached=idb('readonly',function(st){return st.get(KEY);}).then(function(j){
    try{ if(!fresh&&typeof j==='string'&&cfgOk(JSON.parse(j))) show(j); }catch(e){}
  });
  (self.FORM_CFG||Promise.reject(new Error('no config')))
    .then(function(rows){
      var c=JSON.parse(rows[0].value); if(!cfgOk(c)) throw new Error('no form');
      var j=JSON.stringify(c); fresh=true;
      idb('readwrite',function(st){return st.put(j,KEY);});
      show(j);
    })
    .catch(function(){ cached.then(function(){ if(!shown) $('main').innerHTML='<div class="msgc">אין חיבור — נסו שוב מאוחר יותר</div>'; }); });
})();
