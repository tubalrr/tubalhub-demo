/* =========================================================
   GLOBAL CHAT — FOCUS INTERACTIONS
   ========================================================= */
(function(){
  const grid=document.getElementById('chatContent');
  if(!grid)return;

  const setSpotlight=e=>{
    const r=grid.getBoundingClientRect();
    grid.style.setProperty('--mx',(e.clientX-r.left)+'px');
    grid.style.setProperty('--my',(e.clientY-r.top)+'px');
  };
  grid.addEventListener('pointermove',setSpotlight,{passive:true});
  grid.style.setProperty('--mx','50%');
  grid.style.setProperty('--my','45%');

  const refreshDmOnline=()=>{
    document.querySelectorAll('.dm-row').forEach(row=>{
      const uid=row.dataset.uid||'';
      row.classList.toggle('online',!!document.querySelector('.member[data-uid="'+CSS.escape(uid)+'"]'));
    });
  };
  const members=document.getElementById('memberList');
  if(members){
    const observer=new MutationObserver(refreshDmOnline);
    observer.observe(members,{childList:true,subtree:true});
  }
  window.addEventListener('resize',refreshDmOnline,{passive:true});

  const logoSelector='.chat-globe-logo,.member-list .mini,.channel-logo,.rules-logo,.dm-avatar';
  grid.addEventListener('click',e=>{
    const logo=e.target.closest?.(logoSelector);
    if(!logo||!grid.contains(logo))return;
    logo.classList.remove('logo-pop');
    void logo.offsetWidth;
    logo.classList.add('logo-pop');
    setTimeout(()=>logo.classList.remove('logo-pop'),460);
  },{passive:true});
})();