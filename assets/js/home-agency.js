// TUBAL HUB — Homepage agency interactions
(function(){
  const root=document.querySelector('.hub-home');
  if(!root) return;

  const setThemeIndicator=(theme)=>{
    const order=['midnight','forest','light'];
    const index=Math.max(0,order.indexOf(theme));
    const switcher=root.querySelector('.theme-switcher');
    if(switcher) switcher.style.setProperty('--theme-index',index);
  };

  const currentTheme=document.documentElement.getAttribute('data-theme')||'midnight';
  setThemeIndicator(currentTheme);
  window.addEventListener('tubalhubthemechange',e=>setThemeIndicator(e.detail?.theme||'midnight'));

  const revealTargets=root.querySelectorAll(
    '.hub-ad-section,.brand-card,.live-card,.social-card,.facebook-video-card,.news-card,.game-preview-card,.shop-preview-card,.feature-links a'
  );
  revealTargets.forEach(el=>el.classList.add('agency-reveal'));

  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('agency-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:.08,rootMargin:'0px 0px -8% 0px'});
    revealTargets.forEach(el=>io.observe(el));
  }else{
    revealTargets.forEach(el=>el.classList.add('agency-visible'));
  }

  root.addEventListener('pointermove',e=>{
    root.style.setProperty('--agency-cx',e.clientX+'px');
    root.style.setProperty('--agency-cy',e.clientY+'px');

    const card=e.target.closest?.('.brand-card');
    if(card && window.matchMedia('(pointer:fine)').matches){
      const r=card.getBoundingClientRect();
      const px=(e.clientX-r.left)/Math.max(r.width,1);
      const py=(e.clientY-r.top)/Math.max(r.height,1);
      card.style.setProperty('--mx',(px*100)+'%');
      card.style.setProperty('--my',(py*100)+'%');
      card.style.setProperty('--tilt-x',((px-.5)*4)+'deg');
      card.style.setProperty('--tilt-y',((.5-py)*4)+'deg');
    }
  },{passive:true});

  root.addEventListener('pointerout',e=>{
    const card=e.target.closest?.('.brand-card');
    if(card && !card.contains(e.relatedTarget)){
      card.style.setProperty('--mx','50%');
      card.style.setProperty('--my','50%');
      card.style.setProperty('--tilt-x','0deg');
      card.style.setProperty('--tilt-y','0deg');
    }
  },{passive:true});

  const logo=root.querySelector('.hero-logo-large');
  if(logo && window.matchMedia('(pointer:fine)').matches){
    root.addEventListener('pointermove',e=>{
      const r=root.getBoundingClientRect();
      const x=(e.clientX-r.left)/Math.max(r.width,1)-.5;
      const y=(e.clientY-r.top)/Math.max(r.height,1)-.5;
      logo.style.transform='translate3d('+(x*12)+'px,calc(-50% + '+(y*8)+'px),0)';
    },{passive:true});
    root.addEventListener('pointerleave',()=>{
      logo.style.transform='translate3d(0,-50%,0)';
    },{passive:true});
  }

  root.querySelectorAll('.hero-green,.hero-outline,.signup-btn').forEach(btn=>{
    btn.addEventListener('pointermove',e=>{
      if(!window.matchMedia('(pointer:fine)').matches) return;
      const r=btn.getBoundingClientRect();
      const x=(e.clientX-r.left-r.width/2)*.08;
      const y=(e.clientY-r.top-r.height/2)*.08;
      btn.style.transform='translate('+x+'px,'+y+'px)';
    },{passive:true});
    btn.addEventListener('pointerleave',()=>{btn.style.transform='';},{passive:true});
  });
})();
