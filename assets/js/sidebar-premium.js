// TUBAL HUB — Hamburger navigation drawer
(function(){
  const root = document.querySelector('.hub-home');
  const sidebar = document.getElementById('tubalSidebar');
  const trigger = document.getElementById('sidebarMenuTrigger');
  const backdrop = document.getElementById('sidebarBackdrop');
  const closeBtn = document.getElementById('sidebarClose');

  if(!root || !sidebar || !trigger) return;

  const setOpen = (open)=>{
    root.classList.toggle('sidebar-is-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    trigger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    trigger.setAttribute('title', open ? 'Close navigation' : 'Open navigation');
    sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
    if(open){
      document.documentElement.classList.add('tubal-sidebar-open');
      closeBtn?.focus({preventScroll:true});
    }else{
      document.documentElement.classList.remove('tubal-sidebar-open');
    }
  };

  trigger.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    setOpen(!root.classList.contains('sidebar-is-open'));
  });

  closeBtn?.addEventListener('click', ()=>{
    setOpen(false);
    trigger.focus({preventScroll:true});
  });

  backdrop?.addEventListener('click', ()=>setOpen(false));

  sidebar.querySelectorAll('.side-nav a, .side-brand, .fan-btn, .social-mini a, .sidebar-user').forEach(link=>{
    link.addEventListener('click', ()=>{
      setOpen(false);
    });
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && root.classList.contains('sidebar-is-open')){
      setOpen(false);
      trigger.focus({preventScroll:true});
    }
  });

  // Keep the drawer closed on initial load, regardless of older state.
  setOpen(false);
})();
