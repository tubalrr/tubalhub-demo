window.TubalHub={
 defaults:{
  news:[
   {title:"Welcome to TUBAL HUB",text:"Our new digital home for Payapang Isip, CTRLZONE and Profile Tubal.",date:"September 15, 2026"},
   {title:"Three Brands. One Hub.",text:"Explore our growing collection of stories, quotes, projects and community features.",date:"September 15, 2026"}
  ],
  announcements:[
   {title:"TUBAL HUB is getting started",text:"More community features are coming soon."}
  ]
 },
 get(key){try{const v=localStorage.getItem("tubal_"+key);return v?JSON.parse(v):this.defaults[key]||[]}catch(e){return this.defaults[key]||[]}},
 set(key,val){localStorage.setItem("tubal_"+key,JSON.stringify(val))}
};
