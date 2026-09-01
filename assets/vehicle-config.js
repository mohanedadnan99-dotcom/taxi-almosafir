(() => {
'use strict';
let config = null;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function lang(){return document.documentElement.lang==='en'?'en':'ar'}
function fallbackImage(){return '/assets/logo/almosafir-logo.svg'}

function render(){
  const host=document.querySelector('.cars');
  if(!host||!config?.vehicles?.length)return;
  const l=lang();
  host.innerHTML=config.vehicles.map(v=>{
    const label=l==='en'?(v.labelEn||v.name):(v.labelAr||v.name);
    const desc=l==='en'?(v.descriptionEn||''):(v.descriptionAr||'');
    const people=l==='en'?`${v.capacity||0} passengers`:`${v.capacity||0} ركاب`;
    const bags=l==='en'?`${v.bags||0} bags`:`${v.bags||0} أمتعة`;
    return `<button class="car" data-car="${esc(v.name)}"><span class="carVisual"><img src="${esc(v.image||fallbackImage())}" alt="${esc(label)}" loading="lazy" onerror="this.src='${fallbackImage()}'"></span><span class="carCopy"><b>${esc(label)}</b><small>${esc(desc)}</small><span class="cap">${esc(v.className||'SUV')} • ${people} • ${bags}</span></span></button>`;
  }).join('');
  if(typeof state!=='undefined'&&state.car){
    const selected=[...host.querySelectorAll('.car')].find(x=>x.dataset.car===state.car);
    if(selected)selected.classList.add('selected');else state.car='';
  }
}

async function load(){
  try{
    const r=await fetch('/api/config',{cache:'no-store'});
    const j=await r.json();
    if(r.ok&&j?.config){config=j.config;window.ALAMOSAFIR_PUBLIC_CONFIG=config;render()}
  }catch(e){console.warn('Vehicle config fallback',e)}
}

document.addEventListener('click',e=>{
  const car=e.target.closest?.('.cars .car');
  if(!car)return;
  document.querySelectorAll('.cars .car').forEach(x=>x.classList.remove('selected'));
  car.classList.add('selected');
  if(typeof state!=='undefined')state.car=car.dataset.car||'';
  const warning=document.querySelector('#carWarning');if(warning)warning.style.display='none';
});

new MutationObserver((changes)=>{if(changes.some(x=>x.attributeName==='lang'))render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
load();
})();
