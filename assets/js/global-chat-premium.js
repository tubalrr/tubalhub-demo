// TUBAL HUB — Global Chat premium interactions
(function(){
  const zone=document.getElementById('chatContent');
  if(!zone) return;

  const spotTargets=()=>zone.querySelectorAll('.panel,.msg,.bubble');

  const updateSpot=(el,e)=>{
    const r=el.getBoundingClientRect();
    const x=((e.clientX-r.left)/Math.max(r.width,1))*100;
    const y=((e.clientY-r.top)/Math.max(r.height,1))*100;
    el.style.setProperty('--mx',x+'%');
    el.style.setProperty('--my',y+'%');
  };

  zone.addEventListener('pointermove',e=>{
    const panel=e.target.closest?.('.panel');
    const msg=e.target.closest?.('.msg');
    const bubble=e.target.closest?.('.bubble');
    if(panel) updateSpot(panel,e);
    if(msg) updateSpot(msg,e);
    if(bubble) updateSpot(bubble,e);
  },{passive:true});

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node.nodeType!==1) continue;
        node.querySelectorAll?.('.msg');
        if(node.matches?.('.msg')){
          node.style.setProperty('--mx','50%');
          node.style.setProperty('--my','50%');
        }
      }
    }
  });

  const messages=document.getElementById('messages');
  if(messages) observer.observe(messages,{childList:true});
})();