document.addEventListener('DOMContentLoaded',()=>{const box=document.querySelector('#cookieBox'),accept=document.querySelector('#acceptCookie');if(localStorage.getItem('tubalCookie')==='accepted')box?.classList.add('hidden');accept?.addEventListener('click',()=>{box?.classList.add('hidden');try{localStorage.setItem('tubalCookie','accepted')}catch(_){}},{passive:true});const menu=document.querySelector('.menu-btn'),nav=document.querySelector('.nav');menu?.addEventListener('click',()=>{nav?.classList.toggle('open');if(nav?.classList.contains('open')){nav.style.display='flex';nav.style.flexDirection='column';nav.style.position='absolute';nav.style.top='78px';nav.style.left='0';nav.style.right='0';nav.style.padding='12px';nav.style.background='rgba(3,5,4,.97)';nav.style.borderBottom='1px solid #183b29'}else{nav.style.display=''}});});
document.querySelectorAll('header nav a').forEach(a=>{if(a.href===location.href)a.classList.add('active')});

/* TUBAL HUB — GLOBAL THEME SWITCHER */
(function(){
  const KEY='tubalHubTheme';
  const AUTO='tubalHubAutoTheme';
  const root=document.documentElement;
  const body=document.body;
  const systemTheme=()=>window.matchMedia('(prefers-color-scheme: light)').matches?'forest':'galaxy';
  function applyTheme(theme){
    const chosen=theme==='auto'?systemTheme():(theme||'galaxy');
    body.classList.remove('theme-forest','theme-galaxy','theme-neon','theme-aurora','theme-nebula','theme-nexus');
    body.classList.add('theme-'+chosen);
    root.dataset.tubalTheme=chosen;
    window.dispatchEvent(new CustomEvent('tubalhubthemechange',{detail:{theme:chosen}}));
  }
  function getSaved(){return localStorage.getItem(KEY)||'galaxy'}
  function applySaved(){applyTheme(localStorage.getItem(AUTO)==='1'?'auto':getSaved())}
  applySaved();
  const media=window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener?.('change',()=>{if(localStorage.getItem(AUTO)==='1')applyTheme('auto')});

  const settings=document.querySelector('.settings-page');
  if(!settings)return;
  const cards=[...document.querySelectorAll('.theme-option')];
  const auto=document.getElementById('autoTheme');
  const toast=document.getElementById('toast');
  let selected=localStorage.getItem(KEY)||'galaxy';
  if(localStorage.getItem(AUTO)==='1')auto.checked=true;
  function select(theme){selected=theme;cards.forEach(card=>card.classList.toggle('selected',card.dataset.theme===theme));applyTheme(theme)}
  select(selected);
  auto?.addEventListener('change',()=>{localStorage.setItem(AUTO,auto.checked?'1':'0');applyTheme(auto.checked?'auto':selected);showToast(auto.checked?'Auto Theme enabled.':'Auto Theme disabled.')});
  cards.forEach(card=>card.addEventListener('click',()=>{auto.checked=false;localStorage.setItem(AUTO,'0');select(card.dataset.theme)}));
  document.getElementById('previewBtn')?.addEventListener('click',()=>showToast('Preview applied instantly.'));
  document.getElementById('saveBtn')?.addEventListener('click',()=>{localStorage.setItem(KEY,selected);localStorage.setItem(AUTO,auto.checked?'1':'0');applyTheme(auto.checked?'auto':selected);showToast('Theme saved successfully.')} );
  document.getElementById('resetBtn')?.addEventListener('click',()=>{selected='galaxy';auto.checked=false;localStorage.setItem(KEY,'galaxy');localStorage.setItem(AUTO,'0');select('galaxy');showToast('Theme reset to Galaxy default.')} );
  function showToast(message){if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(window.__tubalThemeToast);window.__tubalThemeToast=setTimeout(()=>toast.classList.remove('show'),1800)}
})();

/* Legacy chatbot loader removed. The working Tubal AI assistant remains on the homepage. */

/* TUBAL HUB — site-wide video calling */
(function(){
  const load=()=>{
    if(!document.querySelector('link[data-tubal-video-call-css]')){
      const css=document.createElement('link');
      css.rel='stylesheet';
      css.href='/tubalhub/assets/css/video-call.css?v=20260923-callfix2';
      css.dataset.tubalVideoCallCss='1';
      document.head.appendChild(css);
    }
    if(document.querySelector('script[data-tubal-video-call]'))return;
    const s=document.createElement('script');
    s.type='module';
    s.src='/tubalhub/assets/js/video-call.js?v=20260923-callfix2';
    s.dataset.tubalVideoCall='1';
    document.head.appendChild(s);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();

/* TUBAL HUB — site-wide online presence */
(function(){
  const load=()=>{
    if(document.querySelector('script[data-tubal-presence]'))return;
    const s=document.createElement('script');
    s.type='module';
    s.src='/tubalhub/assets/js/presence.js?v=20260923';
    s.dataset.tubalPresence='1';
    document.head.appendChild(s);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();

/* TUBAL HUB — COPYRIGHT / COPY PROTECTION NOTICE
   Deterrence only: public HTML/CSS/JS can still be inspected or copied.
*/
(function(){
  const BRAND='TUBAL HUB', LICENSE_URL='/tubalhub/pages/license.html';
  try{console.warn('%c'+BRAND+' — Protected Website%c\\nUnauthorized copying, redistribution, resale, or substantially similar public use may violate the TUBAL HUB License.\\nLicense: '+location.origin+LICENSE_URL,'font-weight:900;color:#8b7cff','color:inherit')}catch(_){}
  document.addEventListener('contextmenu',e=>{if(!e.target.closest('input,textarea,[contenteditable="true"]'))e.preventDefault()});
  document.addEventListener('dragstart',e=>{if(e.target.closest('img'))e.preventDefault()});
  document.addEventListener('copy',e=>{
    const sel=window.getSelection?.(); if(!sel||!String(sel).trim())return;
    try{e.clipboardData.setData('text/plain',String(sel)+'\\n\\n© 2026 TUBAL HUB — All rights reserved.\\n'+location.origin+LICENSE_URL);e.preventDefault()}catch(_){}
  });
  window.addEventListener('keydown',e=>{
    const k=String(e.key||'').toLowerCase();
    if((e.ctrlKey||e.metaKey)&&['u','s'].includes(k)){e.preventDefault();return}
    if(e.ctrlKey&&e.shiftKey&&['i','j','c'].includes(k))e.preventDefault();
  });
  window.TUBAL_HUB_LICENSE={name:BRAND,copyright:'© 2026 TUBAL HUB',license:LICENSE_URL};
})();


/* TUBAL HUB — GLOBAL MAINTENANCE MODE */
(function(){
  const path=location.pathname||'';
  if(path.includes('/admin/')) return;
  let active=false;
  const apply=enabled=>{
    active=enabled===true;
    let overlay=document.getElementById('tubalMaintenanceOverlay');
    if(active && !overlay){
      overlay=document.createElement('div');
      overlay.id='tubalMaintenanceOverlay';
      overlay.innerHTML='<div class="tubal-maintenance-card"><div class="tubal-maintenance-logo-wrap"><img class="tubal-maintenance-logo" src="/tubalhub/tubal-hub-logo.png" alt="TUBAL HUB"></div><div class="tubal-maintenance-kicker">TUBAL HUB</div><h1>We’ll be back soon</h1><p>TUBAL HUB is temporarily under maintenance while we improve the platform.</p><small>Please check back shortly.</small></div>';
      const style=document.createElement('style');
      style.id='tubalMaintenanceStyle';
      style.textContent='#tubalMaintenanceOverlay{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(3,7,12,.97);color:#e5e7eb;font-family:Inter,system-ui,sans-serif}#tubalMaintenanceOverlay .tubal-maintenance-card{width:min(520px,100%);padding:42px 28px;text-align:center;border:1px solid rgba(148,163,184,.16);border-radius:28px;background:rgba(15,23,42,.9);box-shadow:0 30px 100px rgba(0,0,0,.5)}#tubalMaintenanceOverlay .tubal-maintenance-logo-wrap{width:82px;height:82px;margin:0 auto 18px;display:grid;place-items:center;border:1px solid rgba(52,211,153,.3);border-radius:22px;background:rgba(2,12,9,.7);box-shadow:0 0 28px rgba(16,185,129,.14);overflow:hidden}#tubalMaintenanceOverlay .tubal-maintenance-logo{width:68px;height:68px;object-fit:contain;display:block}#tubalMaintenanceOverlay .tubal-maintenance-kicker{font-size:10px;letter-spacing:.2em;color:#6ee7b7;font-weight:800}#tubalMaintenanceOverlay h1{margin:10px 0 10px;font-size:30px;color:#f8fafc}#tubalMaintenanceOverlay p{margin:0 auto 12px;max-width:420px;line-height:1.6;color:#94a3b8}#tubalMaintenanceOverlay small{color:#64748b}';
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }else if(!active && overlay){
      overlay.remove();
      document.getElementById('tubalMaintenanceStyle')?.remove();
    }
  };
  const start=async()=>{
    try{
      const {app}=await import('./firebase-config.js');
      const {getFirestore,doc,onSnapshot}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
      const db=getFirestore(app);
      onSnapshot(doc(db,'systemSettings','maintenance'),snap=>apply(snap.exists()&&snap.data()?.enabled===true),()=>{});
    }catch(e){console.warn('Maintenance mode unavailable',e)}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
