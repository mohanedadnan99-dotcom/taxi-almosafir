(() => {
'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let config=null,configStorage=false,ordersCache=[];
const STATUS={new:'جديد',confirmed:'مؤكد',completed:'مكتمل',cancelled:'ملغي'};

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function token(){return sessionStorage.getItem('tm_admin_token')||''}
function authHeaders(){return {Authorization:`Bearer ${token()}`,'Content-Type':'application/json'}}
function fmtDate(v){try{return new Intl.DateTimeFormat('ar-IQ',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return '—'}}
function toast(msg,type='ok'){if(typeof window.toast==='function'){window.toast(msg,type);return}const host=$('#toastHost');if(!host)return;const e=document.createElement('div');e.className=`toast ${type}`;e.textContent=msg;host.appendChild(e);setTimeout(()=>e.remove(),3200)}
function getOrders(){try{if(typeof state!=='undefined'&&Array.isArray(state.orders))return state.orders}catch{}return ordersCache}
function syncOrder(order){ordersCache=ordersCache.filter(o=>o.reference!==order.reference);ordersCache.unshift(order);try{if(typeof state!=='undefined'&&Array.isArray(state.orders)){const i=state.orders.findIndex(o=>o.reference===order.reference);if(i>=0)state.orders[i]=order;else state.orders.unshift(order);if(typeof renderAll==='function')renderAll()}}catch{}renderActivity()}
function syncFleetGlobals(){if(!config?.vehicles)return;try{if(typeof CARS!=='undefined'&&Array.isArray(CARS)){CARS.splice(0,CARS.length,...config.vehicles.filter(v=>v.active).map(v=>({name:v.name,image:v.image,className:v.className,desc:v.descriptionAr||''})));if(typeof renderAll==='function')renderAll()}}catch{}populateManualCars()}
function populateManualCars(){const select=$('#manualCar');if(!select||!config?.vehicles)return;const current=select.value;select.innerHTML='<option value="">اختر السيارة</option>'+config.vehicles.filter(v=>v.active).map(v=>`<option value="${esc(v.name)}">${esc(v.labelAr||v.name)}</option>`).join('');if([...select.options].some(o=>o.value===current))select.value=current}

function injectNavAndPages(){
  const nav=$('.navList');if(nav&&!$('#navActivity')){
    const system=$('.navItem[data-page="system"]');
    system?.insertAdjacentHTML('beforebegin','<button id="navActivity" class="navItem" type="button"><span class="navIcon">◎</span><span>سجل النشاط</span></button>');
    system?.insertAdjacentHTML('afterend','<button id="navSettings" class="navItem" type="button"><span class="navIcon">⚙</span><span>الإعدادات</span></button>');
  }
  const workspace=$('.workspace');if(workspace&&!$('#page-activity'))workspace.insertAdjacentHTML('beforeend',`
    <section id="page-activity" class="page">
      <div class="finalSectionLead"><div><h2>سجل النشاط</h2><p>تتبع إنشاء الطلبات، تغييرات الحالة، التعيينات والملاحظات الإدارية.</p></div><button id="activityRefresh" class="btn btnSoft" type="button">تحديث السجل</button></div>
      <div class="activityToolbar"><input id="activitySearch" type="search" placeholder="بحث برقم الطلب أو المسافر أو المسؤول..."><select id="activityType"><option value="">كل الأنشطة</option><option value="created">إنشاء طلب</option><option value="status">تغيير حالة</option><option value="assignment">تعيين مسؤول</option><option value="note">ملاحظة إدارية</option></select><button id="activityClear" class="btn btnGhost" type="button">مسح</button></div>
      <article class="panel"><header class="panelHead"><div><b>آخر الأنشطة</b><span id="activityCount">0 نشاط</span></div></header><div id="activityList" class="activityList" style="padding:12px"></div></article>
    </section>`);
  if(workspace&&!$('#page-settings'))workspace.insertAdjacentHTML('beforeend',`
    <section id="page-settings" class="page">
      <div class="finalSectionLead"><div><h2>إعدادات النظام</h2><p>إدارة هوية الشركة والأسطول وتجهيز التسعير من مكان واحد.</p></div><span class="fleetManagedBadge">● إعدادات مركزية</span></div>
      <div id="configWarning" class="configWarning hidden"></div>
      <div class="configGrid">
        <form id="companyConfig" class="configCard"><header><div><b>بيانات الشركة</b><span>تظهر كمرجع إداري وتسليم تقني</span></div></header><div class="configFields">
          <label class="configField"><span>اسم الشركة بالعربي</span><input id="cfgNameAr"></label><label class="configField"><span>Company name</span><input id="cfgNameEn" dir="ltr"></label>
          <label class="configField"><span>المدينة</span><input id="cfgCityAr"></label><label class="configField"><span>City</span><input id="cfgCityEn" dir="ltr"></label>
          <label class="configField"><span>هاتف خدمة العملاء</span><input id="cfgSupport" dir="ltr"></label><label class="configField"><span>هاتف العمليات</span><input id="cfgOperations" dir="ltr"></label>
          <label class="configField full"><span>البريد الإلكتروني</span><input id="cfgEmail" type="email" dir="ltr"></label>
        </div></form>
        <article class="configCard"><header><div><b>الجلسة والأمان</b><span>معلومات الجلسة الحالية</span></div></header><div id="sessionCard" class="sessionCard"></div><div class="handoffTools"><button class="backupJsonBtn" type="button">نسخة احتياطية JSON</button><button class="printAdminBtn" type="button">طباعة ملخص</button></div></article>
        <article class="configCard full"><header><div><b>إدارة السيارات</b><span>أي تغيير محفوظ يصبح المصدر المركزي للواجهة والـAPI</span></div><button id="addVehicle" class="btn btnSoft" type="button">+ إضافة سيارة</button></header><div id="fleetEditor" class="fleetEditor"></div><p class="configHint">يمكن تعطيل السيارة بدل حذفها حتى تبقى الطلبات القديمة والتقارير سليمة.</p></article>
        <article class="configCard full"><header><div><b>التسعير حسب المناطق</b><span>جاهز للتعبئة عند اعتماد الأسعار النهائية</span></div><label class="rowToggle"><input id="pricingEnabled" type="checkbox"> تفعيل التسعير</label></header><div class="configFields" style="margin-bottom:10px"><label class="configField"><span>العملة</span><select id="pricingCurrency"><option>IQD</option><option>USD</option></select></label></div><div id="zoneEditor" class="zoneEditor"></div><div class="configActions"><button id="addZone" class="btn btnSoft" type="button">+ إضافة منطقة</button></div><p class="configHint">التسعير يبقى غير ظاهر للزبون إلى أن يتم تفعيله واعتماد المناطق والأسعار.</p></article>
      </div>
      <div class="configActions"><span id="saveState" class="saveState"></span><button id="reloadConfig" class="btn btnGhost" type="button">إلغاء التغييرات</button><button id="saveConfig" class="btn btnPrimary" type="button">حفظ الإعدادات</button></div>
    </section>`);
  $('#navActivity')?.addEventListener('click',()=>openExtra('activity'));
  $('#navSettings')?.addEventListener('click',()=>openExtra('settings'));
}

function openExtra(name){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));
  $$('.navItem').forEach(n=>n.classList.remove('active'));
  $(`#nav${name[0].toUpperCase()+name.slice(1)}`)?.classList.add('active');
  $('#pageEyebrow').textContent=name==='activity'?'التدقيق والمتابعة':'إدارة النظام';
  $('#pageTitle').textContent=name==='activity'?'سجل النشاط':'الإعدادات';
  $('#sidebar')?.classList.remove('open');$('#mobileShade')?.classList.add('hidden');
  if(name==='activity')loadOrdersCache();else loadConfig();
}

async function loadConfig(){
  try{const r=await fetch('/api/config',{headers:token()?{Authorization:`Bearer ${token()}`}:{},cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر تحميل الإعدادات.');config=JSON.parse(JSON.stringify(j.config));configStorage=Boolean(j.storageConfigured);renderConfig();syncFleetGlobals();}
  catch(e){toast(e.message,'bad')}
}

function renderConfig(){
  if(!config)return;
  const c=config.company||{};
  $('#cfgNameAr').value=c.nameAr||'';$('#cfgNameEn').value=c.nameEn||'';$('#cfgCityAr').value=c.cityAr||'';$('#cfgCityEn').value=c.cityEn||'';$('#cfgSupport').value=c.supportPhone||'';$('#cfgOperations').value=c.operationsPhone||'';$('#cfgEmail').value=c.email||'';
  $('#pricingEnabled').checked=Boolean(config.pricing?.enabled);$('#pricingCurrency').value=config.pricing?.currency||'IQD';
  renderFleetEditor();renderZoneEditor();renderSession();
  const warning=$('#configWarning'),save=$('#saveConfig');
  if(!configStorage){warning.textContent='الإعدادات معروضة بالقيم الافتراضية. الحفظ الدائم يحتاج تفعيل تخزين الطلبات على Vercel/Supabase.';warning.classList.remove('hidden');save.disabled=true}else{warning.classList.add('hidden');save.disabled=false}
}

function renderFleetEditor(){const host=$('#fleetEditor');if(!host||!config)return;host.innerHTML=config.vehicles.map((v,i)=>`<div class="fleetEditRow" data-index="${i}"><input data-k="name" value="${esc(v.name)}" placeholder="اسم السيارة"><input data-k="className" value="${esc(v.className||'SUV')}" placeholder="الفئة"><input data-k="capacity" type="number" min="1" max="20" value="${Number(v.capacity)||4}" title="الركاب"><input data-k="bags" type="number" min="0" max="50" value="${Number(v.bags)||0}" title="الأمتعة"><input data-k="image" value="${esc(v.image||'')}" placeholder="مسار الصورة"><button class="removeConfigRow removeVehicle" type="button" title="حذف">×</button><input class="wide" data-k="labelAr" value="${esc(v.labelAr||v.name)}" placeholder="الاسم بالعربي"><input class="wide" data-k="labelEn" value="${esc(v.labelEn||v.name)}" placeholder="English label" dir="ltr"><input class="wide" data-k="descriptionAr" value="${esc(v.descriptionAr||'')}" placeholder="الوصف بالعربي"><input class="wide" data-k="descriptionEn" value="${esc(v.descriptionEn||'')}" placeholder="English description" dir="ltr"><label class="rowToggle"><input data-k="active" type="checkbox" ${v.active?'checked':''}> فعّالة</label><small>${Number(v.capacity)||0} ركاب • ${Number(v.bags)||0} أمتعة</small></div>`).join('')}
function renderZoneEditor(){const host=$('#zoneEditor');if(!host||!config)return;const zones=config.pricing?.zones||[];host.classList.toggle('pricingDisabled',!config.pricing?.enabled);host.innerHTML=zones.length?zones.map((z,i)=>`<div class="zoneEditRow" data-index="${i}"><input data-k="nameAr" value="${esc(z.nameAr||'')}" placeholder="اسم المنطقة"><input data-k="nameEn" value="${esc(z.nameEn||'')}" placeholder="Area name" dir="ltr"><input data-k="price" type="number" min="0" step="1000" value="${Number(z.price)||0}" placeholder="السعر"><label class="rowToggle"><input data-k="active" type="checkbox" ${z.active?'checked':''}> فعّالة</label><button class="removeConfigRow removeZone" type="button">×</button></div>`).join(''):'<div class="emptyState"><b>لا توجد مناطق بعد</b><span>أضف المناطق والأسعار عندما تعتمد التسعيرة النهائية.</span></div>'}

function collectConfig(){
  const next=JSON.parse(JSON.stringify(config));next.company={...next.company,nameAr:$('#cfgNameAr').value.trim(),nameEn:$('#cfgNameEn').value.trim(),cityAr:$('#cfgCityAr').value.trim(),cityEn:$('#cfgCityEn').value.trim(),supportPhone:$('#cfgSupport').value.trim(),operationsPhone:$('#cfgOperations').value.trim(),email:$('#cfgEmail').value.trim()};
  next.vehicles=$$('#fleetEditor .fleetEditRow').map((row,i)=>{const val=k=>row.querySelector(`[data-k="${k}"]`);return{...next.vehicles[Number(row.dataset.index)]||{},id:(val('name').value||`vehicle-${i+1}`).toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:val('name').value.trim(),labelAr:val('labelAr').value.trim(),labelEn:val('labelEn').value.trim(),className:val('className').value.trim()||'SUV',capacity:Number(val('capacity').value)||1,bags:Number(val('bags').value)||0,image:val('image').value.trim(),descriptionAr:val('descriptionAr').value.trim(),descriptionEn:val('descriptionEn').value.trim(),active:val('active').checked,sort:(i+1)*10}}).filter(v=>v.name);
  next.pricing={enabled:$('#pricingEnabled').checked,currency:$('#pricingCurrency').value||'IQD',zones:$$('#zoneEditor .zoneEditRow').map((row,i)=>{const val=k=>row.querySelector(`[data-k="${k}"]`);return{id:`zone-${i+1}`,nameAr:val('nameAr').value.trim(),nameEn:val('nameEn').value.trim(),price:Number(val('price').value)||0,active:val('active').checked,note:''}}).filter(z=>z.nameAr||z.nameEn)};
  return next;
}

async function saveConfig(){if(!token()){toast('سجل الدخول أولاً','bad');return}const btn=$('#saveConfig');btn.disabled=true;$('#saveState').textContent='جاري الحفظ...';try{const body=collectConfig();if(!body.vehicles.some(v=>v.active))throw new Error('يجب إبقاء سيارة فعّالة واحدة على الأقل.');const r=await fetch('/api/config',{method:'PUT',headers:authHeaders(),body:JSON.stringify({config:body})});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر حفظ الإعدادات.');config=JSON.parse(JSON.stringify(j.config));configStorage=Boolean(j.storageConfigured);renderConfig();syncFleetGlobals();$('#saveState').textContent='تم الحفظ بنجاح';toast('تم حفظ إعدادات النظام');setTimeout(()=>$('#saveState').textContent='',2500)}catch(e){$('#saveState').textContent='';toast(e.message,'bad')}finally{btn.disabled=!configStorage}}

function addVehicle(){config.vehicles.push({id:`vehicle-${Date.now()}`,name:'',labelAr:'',labelEn:'',className:'SUV',capacity:4,bags:3,image:'',descriptionAr:'',descriptionEn:'',active:true,sort:(config.vehicles.length+1)*10});renderFleetEditor()}
function addZone(){config.pricing=config.pricing||{enabled:false,currency:'IQD',zones:[]};config.pricing.zones=config.pricing.zones||[];config.pricing.zones.push({id:`zone-${Date.now()}`,nameAr:'',nameEn:'',price:0,active:true,note:''});renderZoneEditor()}

async function loadOrdersCache(){if(!token())return;try{const r=await fetch('/api/orders',{headers:{Authorization:`Bearer ${token()}`},cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر تحميل السجل');ordersCache=Array.isArray(j.orders)?j.orders:[];renderActivity()}catch(e){toast(e.message,'bad')}}
function activityRows(){const rows=[];for(const o of getOrders()){const hist=Array.isArray(o.statusHistory)?o.statusHistory:[];if(!hist.some(h=>h.type==='created'))rows.push({type:'created',at:o.createdAt,actor:o.source==='admin'?'admin':'website',ref:o.reference,name:o.name,status:'new'});for(const h of hist)rows.push({...h,type:h.type||(h.status?'status':'activity'),ref:o.reference,name:o.name})}return rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))}
function activityLabel(a){if(a.type==='created')return['إنشاء طلب',`تم إنشاء حجز ${a.ref}`,'+'];if(a.type==='note')return['ملاحظة إدارية',a.note||'تمت إضافة ملاحظة','N'];if(a.type==='assignment')return['تعيين مسؤول',`تم تعيين ${a.assignee||'مسؤول'}`,'A'];if(a.status)return['تغيير حالة',`تم تغيير الحالة إلى ${STATUS[a.status]||a.status}`,'S'];return['نشاط إداري','تم تحديث الطلب','•']}
function renderActivity(){const host=$('#activityList');if(!host)return;const term=($('#activitySearch')?.value||'').trim().toLowerCase(),type=$('#activityType')?.value||'';const rows=activityRows().filter(a=>(!type||a.type===type)&&(!term||[a.ref,a.name,a.actor,a.assignee,a.note,STATUS[a.status]].join(' ').toLowerCase().includes(term))).slice(0,300);$('#activityCount').textContent=`${rows.length} نشاط`;host.innerHTML=rows.length?rows.map(a=>{const [title,desc,icon]=activityLabel(a);return`<div class="activityItem"><span class="activityDot">${esc(icon)}</span><div class="activityMain"><b>${esc(title)} — <button class="activityRef" data-activity-ref="${esc(a.ref)}">${esc(a.ref)}</button></b><p>${esc(desc)}${a.name?` • ${esc(a.name)}`:''}${a.actor?` • بواسطة ${esc(a.actor)}`:''}</p></div><div class="activityMeta">${esc(fmtDate(a.at))}</div></div>`}).join(''):'<div class="emptyState"><b>لا توجد أنشطة مطابقة</b><span>غيّر البحث أو نوع النشاط.</span></div>'}

function latestAssignee(o){return [...(o.statusHistory||[])].reverse().find(h=>h.type==='assignment'&&h.assignee)?.assignee||'غير معيّن'}
function enhanceOrderDetail(){const detail=$('#orderDetail');if(!detail||detail.querySelector('.adminOpsBox'))return;const ref=$('#orderModalTitle')?.textContent?.trim();const o=getOrders().find(x=>x.reference===ref);if(!o||!ref||ref==='—')return;const internal=(o.statusHistory||[]).filter(h=>h.type==='note'||h.type==='assignment').slice().reverse();detail.insertAdjacentHTML('beforeend',`<section class="adminOpsBox" data-ref="${esc(ref)}"><header><b>إدارة داخلية</b><span>المسؤول الحالي: ${esc(latestAssignee(o))}</span></header><div class="adminOpsGrid"><div class="adminOpsPanel"><label>تعيين مسؤول / موظف</label><input class="assignInput" placeholder="اسم المسؤول" value="${esc(latestAssignee(o)==='غير معيّن'?'':latestAssignee(o))}"><button class="saveAssignment" type="button">حفظ التعيين</button></div><div class="adminOpsPanel"><label>ملاحظة إدارية داخلية</label><textarea class="noteInput" placeholder="لا تظهر للزبون"></textarea><button class="saveInternalNote" type="button">إضافة الملاحظة</button></div></div><div class="internalHistory">${internal.length?internal.map(h=>`<div class="internalEvent"><b>${h.type==='assignment'?'تعيين مسؤول':'ملاحظة إدارية'}</b><span>${esc(h.assignee||h.note||'')} • ${esc(fmtDate(h.at))}${h.actor?` • ${esc(h.actor)}`:''}</span></div>`).join(''):'<div class="internalEvent"><b>لا يوجد نشاط داخلي</b><span>يمكن إضافة ملاحظة أو تعيين مسؤول من الأعلى.</span></div>'}</div></section>`)}
async function orderAction(ref,payload){try{const r=await fetch('/api/orders',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({reference:ref,...payload})});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر تحديث الطلب');syncOrder(j.order);try{if(typeof openOrder==='function')openOrder(ref)}catch{}toast('تم حفظ التحديث')}catch(e){toast(e.message,'bad')}}

function renderSession(){const host=$('#sessionCard');if(!host)return;let data={};try{const raw=token().split('.')[0];data=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')))}catch{}host.innerHTML=`<div><span>الصلاحية</span><b>${esc(data.role||'administrator')}</b></div><div><span>تنتهي الجلسة</span><b>${data.exp?esc(fmtDate(data.exp*1000)):'—'}</b></div><div><span>المستخدم</span><b>${esc(data.sub||'admin')}</b></div>`}
function backupJson(){const data={exportedAt:new Date().toISOString(),config,orders:getOrders()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`taxi-almosafir-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('تم تجهيز النسخة الاحتياطية')}

function bind(){
  document.addEventListener('click',e=>{
    if(e.target.closest('#activityRefresh'))loadOrdersCache();
    if(e.target.closest('#activityClear')){$('#activitySearch').value='';$('#activityType').value='';renderActivity()}
    const ar=e.target.closest('[data-activity-ref]');if(ar){const ref=ar.dataset.activityRef;try{if(typeof openOrder==='function'){openOrder(ref);return}}catch{}$('#orderSearch').value=ref;document.querySelector('.navItem[data-page="orders"]')?.click()}
    if(e.target.closest('#saveConfig'))saveConfig();if(e.target.closest('#reloadConfig'))loadConfig();if(e.target.closest('#addVehicle'))addVehicle();if(e.target.closest('#addZone'))addZone();if(e.target.closest('.backupJsonBtn'))backupJson();if(e.target.closest('.printAdminBtn'))window.print();
    const rv=e.target.closest('.removeVehicle');if(rv){const row=rv.closest('.fleetEditRow');config.vehicles.splice(Number(row.dataset.index),1);renderFleetEditor()}
    const rz=e.target.closest('.removeZone');if(rz){const row=rz.closest('.zoneEditRow');config.pricing.zones.splice(Number(row.dataset.index),1);renderZoneEditor()}
    const box=e.target.closest('.adminOpsBox');if(box&&e.target.closest('.saveAssignment')){const value=box.querySelector('.assignInput').value.trim();if(!value)return toast('اكتب اسم المسؤول','bad');orderAction(box.dataset.ref,{action:'assign',assignee:value})}
    if(box&&e.target.closest('.saveInternalNote')){const value=box.querySelector('.noteInput').value.trim();if(!value)return toast('اكتب الملاحظة','bad');orderAction(box.dataset.ref,{action:'note',note:value})}
  });
  $('#activitySearch')?.addEventListener('input',renderActivity);$('#activityType')?.addEventListener('change',renderActivity);$('#pricingEnabled')?.addEventListener('change',()=>{config.pricing.enabled=$('#pricingEnabled').checked;renderZoneEditor()});
  const detail=$('#orderDetail');if(detail)new MutationObserver(()=>setTimeout(enhanceOrderDetail,0)).observe(detail,{childList:true,subtree:false});
}

function enhanceSystemPage(){const panel=$('#page-system .handoffPanel');if(panel&&!$('#systemHandoffTools'))panel.insertAdjacentHTML('beforeend','<div id="systemHandoffTools" class="handoffTools"><button class="backupJsonBtn" type="button">تصدير نسخة احتياطية JSON</button><button class="printAdminBtn" type="button">طباعة حالة النظام</button><button type="button" onclick="location.href=\'/\'">فتح واجهة الزبون</button></div>')}

injectNavAndPages();enhanceSystemPage();bind();loadConfig();if(token())loadOrdersCache();
})();
