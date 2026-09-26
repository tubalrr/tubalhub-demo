import {app,auth} from "./firebase-config.js";
import {getFirestore,collection,onSnapshot,getDocs,query,where} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";

const db=getFirestore(app);
const shopFunctions=getFunctions(app);
const createShopOrderReal=httpsCallable(shopFunctions,"createShopOrderReal");
const upgradeShopProductReal=httpsCallable(shopFunctions,"upgradeShopProductReal");
const getAuthorizedDownloadReal=httpsCallable(shopFunctions,"getAuthorizedDownloadReal");
const CART_KEY="tubalhub-shop-cart-v2";
const WISH_KEY="tubalhub-shop-wishlist-v1";
const THEME_KEY="tubalhub-theme";
const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{maximumFractionDigits:0});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

const IMG={
  tshirt:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=84",
  shirt:"https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=700&q=84",
  hoodie:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=700&q=84",
  cap:"https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=700&q=84",
  shoes:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=84",
  backpack:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=700&q=84",
  mug:"https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=700&q=84",
  watch:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=84",
  keyboard:"https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=700&q=84",
  controller:"https://images.unsplash.com/photo-1605901309584-818e25960a8f?auto=format&fit=crop&w=700&q=84",
  chair:"https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=700&q=84",
  headphones:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=84",
  plant:"https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=700&q=84",
  journal:"https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=700&q=84",
  candle:"https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=700&q=84",
  notebook:"https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=700&q=84",
  poster:"https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=700&q=84"
};

const galleryPool=[IMG.tshirt,IMG.hoodie,IMG.cap,IMG.backpack,IMG.mug,IMG.poster];
let realProducts=[];
let realProductsUnsubscribe=null;
const parseProductPrice=v=>{const n=Number(String(v??"").replace(/[^0-9.]/g,""));return Number.isFinite(n)?n:0};
const normalizeRealProduct=x=>({id:"real-"+x.id,firestoreId:x.id,real:true,collection:"th",title:String(x.name||"Unnamed Product"),price:parseProductPrice(x.price),priceLabel:String(x.price||"Free"),original:0,originalLabel:"",image:String(x.imageUrl||"").trim(),seller:"TUBAL HUB Shop",sellerInitials:"TH",online:false,stock:null,rating:null,badge:String(x.badge||"").trim(),description:String(x.description||""),details:String(x.description||""),sizes:[],colors:[],productUrl:String(x.productUrl||"").trim(),category:String(x.category||"products"),productType:String(x.productType||"physical"),version:String(x.version||"1.0.0"),releaseDate:String(x.releaseDate||""),license:String(x.license||""),upgradePrice:String(x.upgradePrice||"Free"),latestVersion:String(x.latestVersion||x.version||"1.0.0"),includes:String(x.includes||""),changelog:String(x.changelog||"")});
function listenToRealProducts(){if(realProductsUnsubscribe)realProductsUnsubscribe();realProductsUnsubscribe=onSnapshot(collection(db,"products"),snap=>{realProducts=snap.docs.map(d=>normalizeRealProduct({id:d.id,...d.data()}));renderProducts();updateCounts();renderMyProducts()},e=>console.warn("[TUBAL HUB Shop] real products listener failed",e))}

const products=[
  {id:"th-hoodie",collection:"th",title:"TH Signature Hoodie",price:1790,original:2290,image:IMG.hoodie,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:true,stock:5,rating:4.8,badge:"NEW",description:"Premium-weight community hoodie with a clean TUBAL HUB finish.",details:"Soft-touch hoodie silhouette, relaxed fit, everyday community wear.",sizes:["S","M","L","XL"],colors:["Black","Forest","Stone"]},
  {id:"th-tee",collection:"th",title:"TUBAL HUB Core Tee",price:790,original:990,image:IMG.tshirt,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:true,stock:8,rating:4.8,badge:"HOT",description:"Core TUBAL HUB tee for daily wear and creator sessions.",details:"Lightweight cotton tee with minimalist TH identity.",sizes:["S","M","L","XL"],colors:["Black","White","Green"]},
  {id:"th-oversized",collection:"th",title:"TH Oversized Tee",price:890,original:1090,image:IMG.shirt,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:false,stock:7,rating:4.8,badge:"SALE",description:"Oversized profile tee with clean streetwear proportions.",details:"Relaxed drop-shoulder cut for casual community fits.",sizes:["M","L","XL"],colors:["Black","Grey","Olive"]},
  {id:"th-cap",collection:"th",title:"TUBAL HUB Mono Cap",price:650,original:780,image:IMG.cap,seller:"TUBAL HUB Goods",sellerInitials:"TH",online:true,stock:9,rating:4.8,badge:"NEW",description:"Low-profile cap with a simple TH badge.",details:"Adjustable strap and structured front.",sizes:["One Size"],colors:["Black","Forest"]},
  {id:"th-sneaker",collection:"th",title:"Hub Runner Sneaker",price:2490,original:2990,image:IMG.shoes,seller:"TUBAL HUB Goods",sellerInitials:"TH",online:false,stock:5,rating:4.8,badge:"HOT",description:"Everyday runner concept built around the Hub palette.",details:"Mock product listing for the community shop UI.",sizes:["40","41","42","43"],colors:["Black","White"]},
  {id:"th-pack",collection:"th",title:"Creator Daypack",price:1890,original:2190,image:IMG.backpack,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:true,stock:6,rating:4.8,badge:"SALE",description:"Compact backpack for laptop, camera, and creator gear.",details:"Multi-compartment daypack concept for TUBAL HUB members.",sizes:["One Size"],colors:["Black","Green"]},
  {id:"th-mug",collection:"th",title:"TH Creator Mug",price:520,original:650,image:IMG.mug,seller:"TUBAL HUB Goods",sellerInitials:"TH",online:true,stock:5,rating:4.8,badge:"NEW",description:"Glass-ready desk mug for work, editing, and streams.",details:"Ceramic mug concept with minimalist Hub identity.",sizes:["350ml"],colors:["Black","White"]},
  {id:"th-watch",collection:"th",title:"Hub Time Watch",price:1590,original:1890,image:IMG.watch,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:false,stock:5,rating:4.8,badge:"HOT",description:"Minimal watch concept for the polished TUBAL HUB look.",details:"Clean face, neutral strap, and everyday wear profile.",sizes:["One Size"],colors:["Black","Silver"]},
  {id:"th-keyboard",collection:"th",title:"Creator Desk Keyboard",price:2190,original:2590,image:IMG.keyboard,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:4,rating:4.8,badge:"SALE",description:"Compact keyboard concept for creators and gamers.",details:"Desk accessory concept shown as a premium shop listing.",sizes:["75%"],colors:["Black","White"]},
  {id:"th-control",collection:"th",title:"Hub Game Controller",price:1990,original:2290,image:IMG.controller,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"HOT",description:"Controller concept styled for the TUBAL HUB gaming shelf.",details:"Wireless-ready controller concept for the catalog UI.",sizes:["Standard"],colors:["Black","Green"]},
  {id:"th-chair",collection:"th",title:"Creator Lounge Chair",price:4290,original:4990,image:IMG.chair,seller:"TUBAL HUB Demo Store",sellerInitials:"TH",online:false,stock:5,rating:4.8,badge:"NEW",description:"Comfort-first creator chair concept for long sessions.",details:"Premium lounge-chair concept for the shop catalog.",sizes:["Standard"],colors:["Black","Forest"]},
  {id:"th-headset",collection:"th",title:"Hub Studio Headphones",price:2390,original:2790,image:IMG.headphones,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"SALE",description:"Closed-back headphone concept for editing and gaming.",details:"Over-ear headphone concept used in the premium storefront preview.",sizes:["Standard"],colors:["Black","Silver"]},

  {id:"pi-journal",collection:"payapang",title:"Payapang Journal",price:590,original:740,image:IMG.journal,seller:"Payapang Isip",sellerInitials:"PI",online:true,stock:7,rating:4.8,badge:"NEW",description:"A calm journaling companion for thoughts, plans, and quiet notes.",details:"Minimal journal concept with a soft, nature-first identity.",sizes:["A5"],colors:["Sage","Cream"]},
  {id:"pi-candle",collection:"payapang",title:"Payapang Candle",price:690,original:850,image:IMG.candle,seller:"Payapang Isip",sellerInitials:"PI",online:true,stock:5,rating:4.8,badge:"HOT",description:"Warm desk candle concept for a slower evening atmosphere.",details:"Decorative candle product concept for the Payapang Isip collection.",sizes:["Single"],colors:["Sage","Sand"]},
  {id:"pi-notebook",collection:"payapang",title:"Peace Notes Notebook",price:480,original:590,image:IMG.notebook,seller:"Payapang Isip",sellerInitials:"PI",online:false,stock:9,rating:4.8,badge:"SALE",description:"A compact notebook for daily reflections and reminders.",details:"Everyday notebook concept with clean, quiet visual language.",sizes:["A6","A5"],colors:["Green","Natural"]},
  {id:"pi-plant",collection:"payapang",title:"Quiet Desk Plant",price:790,original:950,image:IMG.plant,seller:"Payapang Isip",sellerInitials:"PI",online:true,stock:5,rating:4.8,badge:"NEW",description:"Nature-forward desk accent for a calmer workspace.",details:"Decorative plant concept for the Payapang Isip collection.",sizes:["Small"],colors:["Sage","Clay"]},
  {id:"pi-mug",collection:"payapang",title:"Payapang Tea Mug",price:560,original:690,image:IMG.mug,seller:"Payapang Isip",sellerInitials:"PI",online:true,stock:6,rating:4.8,badge:"HOT",description:"A gentle ceramic mug concept for tea and quiet work.",details:"Minimal tableware concept for the calm collection.",sizes:["350ml"],colors:["Cream","Sage"]},
  {id:"pi-poster",collection:"payapang",title:"Payapang Wall Print",price:620,original:760,image:IMG.poster,seller:"Payapang Isip",sellerInitials:"PI",online:false,stock:5,rating:4.8,badge:"SALE",description:"Minimal wall-art concept inspired by stillness and nature.",details:"Decorative print concept for home or workspace.",sizes:["A4","A3"],colors:["Green","Neutral"]},

  {id:"cz-keyboard",collection:"ctrlzone",title:"CTRLZONE Compact Keyboard",price:2290,original:2790,image:IMG.keyboard,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"HOT",description:"A compact gaming desk concept with a clean CTRLZONE feel.",details:"75% layout concept for modern gaming desks.",sizes:["75%"],colors:["Black","Purple"]},
  {id:"cz-headset",collection:"ctrlzone",title:"CTRLZONE Headset",price:2590,original:3190,image:IMG.headphones,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"NEW",description:"Immersive headset concept for ranked sessions and streams.",details:"Over-ear gaming audio concept with a premium storefront profile.",sizes:["Standard"],colors:["Black","Purple"]},
  {id:"cz-controller",collection:"ctrlzone",title:"CTRLZONE Controller",price:2090,original:2490,image:IMG.controller,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:false,stock:8,rating:4.8,badge:"SALE",description:"Controller concept for MOBA, racing, and action sessions.",details:"Modern controller concept with ergonomic shape.",sizes:["Standard"],colors:["Black","Neon"]},
  {id:"cz-chair",collection:"ctrlzone",title:"CTRLZONE Gaming Chair",price:4690,original:5290,image:IMG.chair,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"HOT",description:"Premium chair concept for long gaming and creator sessions.",details:"High-back gaming chair concept for the CTRLZONE catalog.",sizes:["Standard"],colors:["Black","Purple"]},
  {id:"cz-pack",collection:"ctrlzone",title:"CTRLZONE Gear Pack",price:1790,original:2090,image:IMG.backpack,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:true,stock:5,rating:4.8,badge:"NEW",description:"Compact gear pack concept for cables, controllers, and extras.",details:"Multi-use gaming carry pack concept.",sizes:["One Size"],colors:["Black","Purple"]},
  {id:"cz-desk-mat",collection:"ctrlzone",title:"CTRLZONE Desk Mat",price:850,original:990,image:IMG.shirt,seller:"CTRLZONE Supply",sellerInitials:"CZ",online:false,stock:11,rating:4.8,badge:"SALE",description:"Wide desk-mat concept built around the CTRLZONE identity.",details:"Large desk surface concept for keyboard and mouse setups.",sizes:["XL"],colors:["Black","Purple"]}
];

const state={
  collection:"all",
  categoryFilter:"all",
  query:"",
  stockFilter:"all",
  priceFilter:"all",
  cart:[],
  wishlist:new Set(),
  current:null,
  quickQty:1,
  selectedSize:"",
  selectedColor:"",
  filterOpen:false,
  payment:"card",
  upgradeTarget:null
};

const els={
  grid:document.getElementById("productsGrid"),
  empty:document.getElementById("emptyProducts"),
  search:document.getElementById("productSearch"),
  filterBtn:document.getElementById("filterBtn"),
  filterPanel:document.getElementById("filterPanel"),
  cartBtn:document.getElementById("cartBtn"),
  cartBadge:document.getElementById("cartBadge"),
  cartTitleCount:document.getElementById("cartTitleCount"),
  cartDrawer:document.getElementById("cartDrawer"),
  cartBackdrop:document.getElementById("cartBackdrop"),
  cartList:document.getElementById("cartList"),
  cartEmpty:document.getElementById("cartEmpty"),
  cartSubtotal:document.getElementById("cartSubtotal"),
  cartShipping:document.getElementById("cartShipping"),
  cartTotal:document.getElementById("cartTotal"),
  quickLayer:document.getElementById("quickViewLayer"),
  quickModal:document.querySelector("#quickViewLayer .quickview-modal"),
  quickImage:document.getElementById("quickViewImage"),
  quickThumbs:document.getElementById("quickViewThumbs"),
  quickTitle:document.getElementById("quickViewTitle"),
  quickShop:document.getElementById("quickViewShop"),
  quickPrice:document.getElementById("quickViewPrice"),
  quickOriginal:document.getElementById("quickViewOriginal"),
  quickDescription:document.getElementById("quickViewDescription"),
  quickBadge:document.getElementById("quickViewBadge"),
  quickStock:document.getElementById("quickViewStock"),
  quickSizes:document.getElementById("quickViewSizes"),
  quickColors:document.getElementById("quickViewColors"),
  quickDetails:document.getElementById("quickViewDetails"),
  quickQty:document.getElementById("quickViewQty"),
  quickQtyWrap:document.getElementById("quickViewQtyWrap"),
  quickAdd:document.getElementById("quickViewAdd"),
  quickBuy:document.getElementById("quickViewBuy"),
  quickDigitalMeta:document.getElementById("quickViewDigitalMeta"),
  quickVersion:document.getElementById("quickViewVersion"),
  quickLicense:document.getElementById("quickViewLicense"),
  quickRelease:document.getElementById("quickViewRelease"),
  quickIncludes:document.getElementById("quickViewIncludes"),
  quickIncludesText:document.getElementById("quickViewIncludesText"),
  quickDownload:document.getElementById("quickViewDownload"),
  quickUpgrade:document.getElementById("quickViewUpgrade"),
  myProductsSection:document.getElementById("myProductsSection"),
  myProductsGrid:document.getElementById("myProductsGrid"),
  myProductsStatus:document.getElementById("myProductsStatus"),
  checkoutLayer:document.getElementById("checkoutLayer"),
  checkoutTotal:document.getElementById("checkoutTotal"),
  checkoutCopy:document.getElementById("checkoutCopy"),
  toast:document.getElementById("filterToast"),
  particleLayer:document.getElementById("particleLayer")
};

function readLocal(key,fallback){
  try{const v=JSON.parse(localStorage.getItem(key)||"null");return v??fallback}catch(_){return fallback}
}
function saveLocal(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}
}
function productById(id){return [...realProducts,...products].find(p=>p.id===id)}
function collectionProducts(){return [...realProducts,...products]}
function brandMarkHtml(collection,small=false){
  if(collection==="th") return '<span class="mini-brand-logo th"><img src="../tubal-hub-logo.png" width="'+(small?22:28)+'" height="'+(small?22:28)+'" alt="TUBAL HUB"></span>';
  if(collection==="payapang") return '<span class="mini-brand-logo pi" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M31 6C19 6 10 12 10 22c0 7 5 12 12 12 9 0 12-10 9-28Z"/><path d="M8 33c4-7 10-12 18-16"/></svg></span>';
  return '<span class="mini-brand-logo cz" aria-hidden="true"><svg viewBox="0 0 44 34"><path d="M8 11h28a8 8 0 0 1 7.1 11.2l-3.6 7.3a4 4 0 0 1-7.2.2l-3-5.5H14.7l-3 5.5a4 4 0 0 1-7.2-.2L1 22.2A8 8 0 0 1 8 11Z"/><path d="M12 17v7M8.5 20.5h7M31 17.5h.01M35 21.5h.01"/></svg></span>';
}
function cartCount(){return state.cart.reduce((n,x)=>n+Number(x.qty||0),0)}
function subtotal(){return state.cart.reduce((n,x)=>{const p=productById(x.id);return n+(p?Number(p.price)*Number(x.qty||0):0)},0)}
function shipping(){return cartCount()?120:0}
function total(){return subtotal()+shipping()}
function saveCart(){saveLocal(CART_KEY,state.cart)}
function loadCart(){
  const raw=readLocal(CART_KEY,null);
  state.cart=Array.isArray(raw)?raw.filter(x=>productById(x.id)&&Number(x.qty)>0).map(x=>({id:x.id,qty:Math.min(10,Math.max(1,Number(x.qty)))})):[];
  if(!raw)saveCart();
}
function loadWishlist(){state.wishlist=new Set(readLocal(WISH_KEY,[]))}
function saveWishlist(){saveLocal(WISH_KEY,[...state.wishlist])}

function notify(message){
  els.toast.textContent=message;
  els.toast.classList.add("open");
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>els.toast.classList.remove("open"),2200);
}
function burstAt(el,count=8){
  if(!el)return;
  const r=el.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const dot=document.createElement("i");
    dot.className="shop-particle";
    dot.style.left=(r.left+r.width/2)+"px";
    dot.style.top=(r.top+r.height/2)+"px";
    const angle=(Math.PI*2/count)*i;
    const distance=26+Math.random()*34;
    els.particleLayer.appendChild(dot);
    dot.animate(
      [{transform:"translate3d(-50%,-50%,0) scale(.75)",opacity:0},
       {transform:"translate3d(calc(-50% + "+(Math.cos(angle)*distance*.55)+"px),calc(-50% + "+(Math.sin(angle)*distance*.55)+"px),0) scale(1)",opacity:1},
       {transform:"translate3d(calc(-50% + "+(Math.cos(angle)*distance)+"px),calc(-50% + "+(Math.sin(angle)*distance)+"px),0) scale(.15)",opacity:0}],
      {duration:520,fill:"forwards",easing:"cubic-bezier(.16,1,.3,1)"}
    ).onfinish=()=>dot.remove();
  }
}
function updateSpot(e){
  const card=e.target.closest?.(".product-card,.glass-surface");
  if(!card)return;
  const r=card.getBoundingClientRect();
  card.style.setProperty("--mx",(e.clientX-r.left)+"px");
  card.style.setProperty("--my",(e.clientY-r.top)+"px");
}
document.addEventListener("pointermove",updateSpot,{passive:true});

function filteredProducts(){
  const q=state.query.trim().toLowerCase();
  let list=collectionProducts();
  if(q)list=list.filter(p=>(p.title+" "+p.seller+" "+p.description).toLowerCase().includes(q));
  if(state.categoryFilter!=="all")list=list.filter(p=>String(p.category||"").toLowerCase()===state.categoryFilter);
  if(state.stockFilter==="in-stock")list=list.filter(p=>p.stock>0);
  if(state.priceFilter==="under-1000")list=list.filter(p=>p.price<1000);
  if(state.priceFilter==="1000-2500")list=list.filter(p=>p.price>=1000&&p.price<=2500);
  if(state.priceFilter==="over-2500")list=list.filter(p=>p.price>2500);
  return list;
}

function cardHtml(p,index){
  const wished=state.wishlist.has(p.id);
  const isReal=Boolean(p.real);
  const priceHtml=isReal?'<strong class="product-price">'+esc(p.priceLabel)+'</strong>':'<strong class="product-price">'+money(p.price)+'</strong><span class="product-original">'+money(p.original)+'</span>';
  const metaHtml=isReal?'<div class="product-rating-row"><span>REAL ADMIN PRODUCT</span><span>'+esc(p.category)+'</span></div>':'<div class="product-rating-row"><span>⭐ '+p.rating.toFixed(1)+'</span><span>Premium listing</span><span class="stock-low">'+p.stock+' left</span></div>';
  const actionHtml=isReal&&p.productUrl?'<a class="add-btn real-product-link" href="'+esc(p.productUrl)+'" target="_blank" rel="noopener noreferrer">Open Product</a>':'<button class="add-btn" data-add="'+esc(p.id)+'" type="button">Add to Cart</button>';
  return '<article class="product-card" data-product-id="'+esc(p.id)+'" style="--stagger:'+(index*.05)+'s">'+
    '<div class="product-visual">'+
      (p.image?'<img src="'+esc(p.image)+'" alt="'+esc(p.title)+'" loading="lazy" decoding="async">':'<div class="product-no-image" aria-label="No product image">NO IMAGE</div>')+
      (p.badge?'<span class="product-badge">'+esc(p.badge)+'</span>':'')+
      (isReal?'':'<button class="quick-view-btn" data-quick="'+esc(p.id)+'" type="button" aria-label="Quick view '+esc(p.title)+'">◉</button>')+
    '</div>'+
    '<div class="product-info">'+
      '<h3 class="product-title">'+esc(p.title)+'</h3>'+
      '<div class="product-shop product-shop-brand">'+brandMarkHtml(p.collection,true)+'<span>'+esc(p.seller)+'</span></div>'+
      '<div class="product-price-row">'+priceHtml+'</div>'+
      metaHtml+
      '<div class="seller-row">'+
        '<div class="seller-avatar">'+esc(p.sellerInitials)+'</div>'+
        '<div class="seller-copy"><strong>'+esc(p.seller)+'</strong><span>'+ (isReal?"From Admin":"Catalog Demo") +'</span></div>'+
        '<div class="seller-actions"><button class="wishlist-btn '+(wished?"active":"")+'" data-wishlist="'+esc(p.id)+'" type="button" aria-label="'+(wished?"Remove from wishlist":"Add to wishlist")+'">'+(wished?"♥":"♡")+'</button>'+actionHtml+'</div>'+
      '</div>'+
    '</div>'+
  '</article>';
}

function renderProducts(){
  const list=filteredProducts();
  els.grid.innerHTML=list.map(cardHtml).join("");
  els.empty.hidden=Boolean(list.length);
  els.grid.hidden=!list.length;
  document.getElementById("resultCount").textContent=list.length+" "+(list.length===1?"product":"products");
  document.getElementById("catalogStatus").textContent=state.query?"Filtered results":"Available now";
}
function updateCollectionUI(){
  document.querySelectorAll(".collection-tab").forEach(btn=>{
    const active=btn.dataset.categoryTab===state.categoryFilter;
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-selected",active?"true":"false");
  });
  const names={all:"ALL CATEGORIES",merchandise:"MERCHANDISE",clothing:"CLOTHING",accessories:"ACCESSORIES","digital-products":"DIGITAL PRODUCTS","apps-software":"APPS & SOFTWARE",gaming:"GAMING","mods-addons":"MODS & ADD-ONS",media:"MEDIA",wellness:"WELLNESS",other:"OTHER"};
  document.getElementById("catalogTitle").textContent=names[state.categoryFilter]||"ALL CATEGORIES";
  renderProducts();
}
function updateCounts(){
  const all=[...realProducts,...products];
  const categories=["all","merchandise","clothing","accessories","digital-products","apps-software","gaming","mods-addons","media","wellness","other"];
  categories.forEach(cat=>{
    const n=cat==="all"?all.length:all.filter(p=>String(p.category||"").toLowerCase()===cat).length;
    const el=document.getElementById("count-category-"+cat);
    if(el)el.textContent=n+" "+(n===1?"product":"products");
  });
}

function updateCartUI(){
  const count=cartCount();
  els.cartBadge.textContent=count;
  els.cartBadge.hidden=!count;
  els.cartTitleCount.textContent=count+" "+(count===1?"item":"items");
  els.cartList.innerHTML=state.cart.map(item=>{
    const p=productById(item.id);if(!p)return"";
    return '<div class="cart-row">'+
      '<div class="cart-thumb"><img src="'+esc(p.image)+'" alt=""></div>'+
      '<div class="cart-row-copy"><strong>'+esc(p.title)+'</strong><small class="cart-shop-brand">'+brandMarkHtml(p.collection,true)+'<span>'+esc(p.seller)+'</span></small><div class="cart-row-bottom"><div class="qty-stepper"><button data-cart-minus="'+esc(p.id)+'" type="button">−</button><span>'+item.qty+'</span><button data-cart-plus="'+esc(p.id)+'" type="button">+</button></div></div></div>'+
      '<div><div class="cart-row-price">'+money(p.price*item.qty)+'</div><button class="cart-delete" data-cart-delete="'+esc(p.id)+'" type="button" aria-label="Remove '+esc(p.title)+'">⌫</button></div>'+
    '</div>';
  }).join("");
  const has=Boolean(state.cart.length);
  els.cartList.hidden=!has;
  els.cartEmpty.hidden=has;
  els.cartSubtotal.textContent=money(subtotal());
  els.cartShipping.textContent=money(shipping());
  els.cartTotal.textContent=money(total());
  document.getElementById("checkoutBtn").disabled=!has;
  document.getElementById("cartTitleCount").textContent=count+" "+(count===1?"item":"items");
}

async function createShopNotification(p,action){
  const user=auth.currentUser;
  if(!user||user.isAnonymous)return;
  const name=user.displayName||user.email?.split("@")[0]||"Member";
  try{
    await addDoc(collection(db,"notifications"),{
      recipientUid:user.uid,
      actorUid:user.uid,
      actorName:name,
      actorPhotoURL:user.photoURL||"",
      actorOnline:true,
      type:"shop",
      title:action==="buy"?"Shop order created":"Shop cart update",
      preview:name+" "+(action==="buy"?"bought ":"added ") + p.title,
      productImage:p.image,
      url:"pages/shop.html#"+encodeURIComponent(p.id),
      read:false,
      createdAt:serverTimestamp()
    });
    window.dispatchEvent(new CustomEvent("tubalhub-shop-notification",{detail:{productId:p.id,action}}));
  }catch(e){console.warn("[TUBAL HUB Shop] notification failed",e)}
}
function addToCart(id,qty=1,trigger=null,action="cart"){
  const p=productById(id);if(!p)return;
  const row=state.cart.find(x=>x.id===id);
  const next=Math.min(10,(row?.qty||0)+Math.max(1,qty));
  if(row)row.qty=next;else state.cart.push({id,qty:Math.max(1,qty)});
  saveCart();updateCartUI();
  if(trigger){trigger.classList.remove("is-pop");void trigger.offsetWidth;trigger.classList.add("is-pop");burstAt(trigger,8)}
  burstAt(els.cartBtn,6);
  notify("Added to cart! "+p.title);
  createShopNotification(p,action);
}
function removeCart(id){state.cart=state.cart.filter(x=>x.id!==id);saveCart();updateCartUI()}
function stepCart(id,delta){
  const row=state.cart.find(x=>x.id===id);if(!row)return;
  row.qty=Math.max(0,Math.min(10,row.qty+delta));if(!row.qty)removeCart(id);else{saveCart();updateCartUI()}
}
function toggleWishlist(id,btn){
  const p=productById(id);if(!p)return;
  if(state.wishlist.has(id))state.wishlist.delete(id);else state.wishlist.add(id);
  saveWishlist();
  btn.classList.toggle("active",state.wishlist.has(id));
  btn.textContent=state.wishlist.has(id)?"♥":"♡";
  burstAt(btn,6);
  notify(state.wishlist.has(id)?"Added to wishlist":"Removed from wishlist");
}

function openCart(){els.cartBackdrop.hidden=false;requestAnimationFrame(()=>els.cartDrawer.classList.add("open"));els.cartDrawer.setAttribute("aria-hidden","false")}
function closeCart(){els.cartDrawer.classList.remove("open");els.cartDrawer.setAttribute("aria-hidden","true");setTimeout(()=>{if(!els.cartDrawer.classList.contains("open"))els.cartBackdrop.hidden=true},260)}
function shopNow(){document.getElementById("catalog").scrollIntoView({behavior:"smooth",block:"start"});burstAt(document.getElementById("heroShopNow"),6)}
function galleryFor(p){return [p.image,galleryPool[(products.indexOf(p)+1)%galleryPool.length],galleryPool[(products.indexOf(p)+2)%galleryPool.length],galleryPool[(products.indexOf(p)+3)%galleryPool.length]]}

function licenseForProduct(id){return ownedLicenses.find(x=>x.productId===id)||null}
async function openAuthorizedDownload(licenseId){
  try{
    const result=await getAuthorizedDownloadReal({licenseId});
    const url=String(result?.data?.url||"").trim();
    if(!url){notify("Protected download is not available.");return}
    window.open(url,"_blank","noopener,noreferrer");
  }catch(e){
    console.error("[TUBAL HUB Shop] protected download failed",e);
    notify("Download is unavailable. A paid license is required.");
  }
}
function renderMyProducts(){
  if(!els.myProductsSection)return;
  const user=auth.currentUser;
  if(!user||user.isAnonymous){els.myProductsSection.hidden=true;return}
  els.myProductsSection.hidden=false;
  els.myProductsStatus.textContent=ownedLicenses.length?ownedLicenses.length+" owned product"+(ownedLicenses.length===1?"":"s"):"No digital licenses yet";
  els.myProductsGrid.innerHTML=ownedLicenses.map(l=>{const p=productById(l.productId);if(!p)return"";const latest=p.latestVersion||p.version||l.ownedVersion;const upgrade=latest!==l.ownedVersion;const history=upgradeHistory.filter(x=>x.productId===l.productId);return '<article class="owned-product-card"><div><b>'+esc(p.title)+'</b><span>Owned Version: v'+esc(l.ownedVersion)+'</span><span>License: '+esc(l.licenseType||p.license||"Standard")+'</span><span>Latest Version: v'+esc(latest)+'</span><div class="upgrade-history"><b>Purchase History</b><span>v'+esc(l.ownedVersion)+' → Purchased</span>'+history.map(x=>'<span>v'+esc(x.toVersion||"—")+' → Upgraded</span>').join("")+'</div></div><div class="owned-product-actions"><button class="add-btn" data-download-license="'+esc(l.id)+'" type="button">Download</button>'+(upgrade?'<button class="buy-now-btn" data-upgrade="'+esc(p.id)+'" type="button">Upgrade</button>':'<span class="owned-current">Up to date</span>')+'</div></article>'}).join("")||'<div class="shop-empty">No digital products owned yet.</div>';
}
function listenToOwnedProducts(user){
  if(licenseUnsubscribe){licenseUnsubscribe();licenseUnsubscribe=null}
  if(upgradeUnsubscribe){upgradeUnsubscribe();upgradeUnsubscribe=null}
  ownedLicenses=[];upgradeHistory=[];
  if(!user||user.isAnonymous){renderMyProducts();return}
  const q=query(collection(db,"licenses"),where("uid","==",user.uid));
  const uq=query(collection(db,"upgrades"),where("uid","==",user.uid));
  licenseUnsubscribe=onSnapshot(q,snap=>{ownedLicenses=snap.docs.map(d=>({id:d.id,...d.data()}));renderMyProducts()},e=>{console.warn("[TUBAL HUB Shop] license listener failed",e);renderMyProducts()});
  upgradeUnsubscribe=onSnapshot(uq,snap=>{upgradeHistory=snap.docs.map(d=>({id:d.id,...d.data()}));renderMyProducts()},e=>console.warn("[TUBAL HUB Shop] upgrade history listener failed",e));
}

function openQuick(id){
  const p=productById(id);if(!p)return;
  state.current=p;state.quickQty=1;state.selectedSize=(p.sizes||[])[0]||"";state.selectedColor=(p.colors||[])[0]||"";
  els.quickBadge.textContent=p.badge||"";
  els.quickTitle.textContent=p.title;
  els.quickShop.innerHTML=brandMarkHtml(p.collection,true)+'<span>'+esc(p.seller)+'</span>';
  els.quickPrice.textContent=p.real?String(p.priceLabel||"Free"):money(p.price);
  els.quickOriginal.textContent=p.real?"":money(p.original);
  els.quickDescription.textContent=p.description||"";
  const digital=p.real&&p.productType!=="physical";
  els.quickDigitalMeta.hidden=!digital;
  els.quickIncludes.hidden=!(digital&&p.includes);
  if(digital){els.quickVersion.textContent=p.version||"—";els.quickLicense.textContent=p.license||"—";els.quickRelease.textContent=p.releaseDate||"—";els.quickIncludesText.textContent=p.includes||""}
  els.quickStock.textContent=p.stock!=null?p.stock+" left":digital?"Digital delivery":"Available";
  els.quickDetails.textContent=p.details||p.changelog||"";
  els.quickQty.textContent="1";
  const imgs=p.image?[p.image]:galleryFor(p).filter(Boolean);
  els.quickImage.src=imgs[0]||"";
  els.quickImage.alt=p.title;
  els.quickThumbs.innerHTML=imgs.map((src,i)=>'<button class="'+(i===0?"active":"")+'" data-thumb="'+i+'" type="button"><img src="'+esc(src)+'" alt=""></button>').join("");
  els.quickSizes.innerHTML=(p.sizes||[]).map((v,i)=>'<button class="'+(i===0?"active":"")+'" data-size="'+esc(v)+'" type="button">'+esc(v)+'</button>').join("");
  els.quickColors.innerHTML=(p.colors||[]).map((v,i)=>'<button class="'+(i===0?"active":"")+'" data-color="'+esc(v)+'" type="button">'+esc(v)+'</button>').join("");
  const owned=digital?licenseForProduct(p.firestoreId):null;
  const upgrade=owned&&p.latestVersion&&owned.ownedVersion!==p.latestVersion;
  els.quickDownload.hidden=!(digital&&owned&&p.downloadUrl);
  if(digital&&owned&&p.downloadUrl)els.quickDownload.href=p.downloadUrl;
  els.quickUpgrade.hidden=!upgrade;
  els.quickAdd.hidden=digital;
  els.quickBuy.hidden=false;
  els.quickQtyWrap.hidden=digital;
  els.quickBuy.textContent=digital?(owned?"Upgrade / Buy":"Buy Now"):"Buy Now";
  els.quickLayer.hidden=false;
  requestAnimationFrame(()=>els.quickLayer.classList.add("is-open"));
}
function closeQuick(){els.quickLayer.classList.remove("is-open");setTimeout(()=>{if(!els.quickLayer.classList.contains("is-open"))els.quickLayer.hidden=true},220)}
function updatePaymentUI(){
  const data={card:{title:"Card",formTitle:"Card details",brand:"VISA / MASTERCARD"},bank:{title:"Bank Transfer",formTitle:"Bank transfer details",brand:"BANK"},paypal:{title:"PayPal",formTitle:"PayPal details",brand:"PAYPAL"}}[state.payment];
  if(!data)return;
  document.querySelectorAll(".payment-method").forEach(b=>b.classList.toggle("active",b.dataset.payment===state.payment));
  document.getElementById("paymentFormTitle").textContent=data.formTitle;
  document.getElementById("paymentFormBrand").textContent=data.brand;
  const grid=document.querySelector(".payment-form-grid");
  if(grid){
    grid.innerHTML=state.payment==="card"
      ? '<div class="payment-field-full payment-provider-note"><strong>Card payments are not connected.</strong><p>This template does not collect card numbers, expiry dates, or CVV. Connect a PCI-compliant payment provider before enabling card checkout.</p></div>'
      : state.payment==="bank"
      ? '<label class="payment-field-full">Account name<input id="bankName" type="text" autocomplete="name" placeholder="Account name" required></label><label class="payment-field-full">Bank reference<input id="bankReference" type="text" placeholder="Reference number" required></label>'
      : '<label class="payment-field-full">PayPal email<input id="paypalEmail" type="email" autocomplete="email" placeholder="you@example.com" required></label><label class="payment-field-full">PayPal reference<input id="paypalReference" type="text" placeholder="Payment reference" required></label>';
  }
  const copy=document.getElementById("checkoutCopy");
  if(copy)copy.textContent=state.upgradeTarget?"Upgrade "+state.upgradeTarget.product.title+" to v"+state.upgradeTarget.product.latestVersion+" • "+data.title+" selected.":cartCount()+" items ready • "+data.title+" selected.";
}
function openCheckout(){
  if(!state.cart.length&&!state.upgradeTarget)return;
  els.checkoutTotal.textContent=money(state.upgradeTarget?parseProductPrice(state.upgradeTarget.product.upgradePrice):total());
  els.checkoutLayer.hidden=false;
  updatePaymentUI();
  requestAnimationFrame(()=>els.checkoutLayer.classList.add("is-open"));
}
function closeCheckout(){els.checkoutLayer.classList.remove("is-open");setTimeout(()=>{if(!els.checkoutLayer.classList.contains("is-open"))els.checkoutLayer.hidden=true},220)}
async function buyProduct(p,qty=1){
  addToCart(p.id,qty,document.getElementById("quickViewBuy"),"buy");
  openCheckout();
  notify("Buy Now ready for "+p.title);
}

function shareProduct(p,type){
  const url=location.origin+location.pathname+"#"+encodeURIComponent(p.id);
  const text=p.title+" — TUBAL HUB Shop";
  let target="";
  if(type==="facebook")target="https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(url);
  if(type==="messenger")target="https://www.facebook.com/dialog/send?link="+encodeURIComponent(url);
  if(type==="whatsapp")target="https://wa.me/?text="+encodeURIComponent(text+" "+url);
  if(type==="x")target="https://twitter.com/intent/tweet?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(url);
  if(type==="copy"){navigator.clipboard?.writeText(url);notify("Product link copied");return}
  if(target)window.open(target,"_blank","noopener,noreferrer,width=640,height=620");
}

function setThemeFromStorage(){
  const theme=localStorage.getItem(THEME_KEY)||"midnight";
  document.body.classList.remove("theme-midnight","theme-forest","theme-light");
  document.body.classList.add("theme-"+theme);
}
document.querySelectorAll(".quickview-layer").forEach(layer=>{layer.classList.remove("is-open");layer.hidden=true;});
setThemeFromStorage();
window.addEventListener("tubalhubthemechange",e=>{
  const t=e.detail?.theme||"midnight";
  document.body.classList.remove("theme-midnight","theme-forest","theme-light");
  document.body.classList.add("theme-"+t);
});

document.addEventListener("click",async e=>{
  const categoryTab=e.target.closest?.(".collection-tab[data-category-tab]");if(categoryTab){state.categoryFilter=categoryTab.dataset.categoryTab||"all";state.query="";els.search.value="";state.stockFilter="all";state.priceFilter="all";document.querySelectorAll(".filter-chip").forEach(b=>b.classList.remove("active"));document.querySelector('[data-category-filter="'+state.categoryFilter+'"]')?.classList.add("active");document.querySelector('[data-stock-filter="all"]')?.classList.add("active");document.querySelectorAll("[data-price-filter]").forEach(b=>{if(b.dataset.priceFilter==="all")b.classList.add("active")});updateCollectionUI();return}
  const add=e.target.closest?.("[data-add]");if(add){addToCart(add.dataset.add,1,add);return}
  const wish=e.target.closest?.("[data-wishlist]");if(wish){toggleWishlist(wish.dataset.wishlist,wish);return}
  const quick=e.target.closest?.("[data-quick]");if(quick){openQuick(quick.dataset.quick);return}
  const minus=e.target.closest?.("[data-cart-minus]");if(minus){stepCart(minus.dataset.cartMinus,-1);return}
  const plus=e.target.closest?.("[data-cart-plus]");if(plus){stepCart(plus.dataset.cartPlus,1);return}
  const del=e.target.closest?.("[data-cart-delete]");if(del){removeCart(del.dataset.cartDelete);notify("Removed from cart");return}
  const thumb=e.target.closest?.("[data-thumb]");if(thumb&&state.current){const imgs=galleryFor(state.current);const i=Number(thumb.dataset.thumb)||0;els.quickImage.src=imgs[i];els.quickThumbs.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===thumb));return}
  const size=e.target.closest?.("[data-size]");if(size&&state.current){state.selectedSize=size.dataset.size;els.quickSizes.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===size));return}
  const color=e.target.closest?.("[data-color]");if(color&&state.current){state.selectedColor=color.dataset.color;els.quickColors.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===color));return}
  const share=e.target.closest?.("[data-share]");if(share&&state.current){shareProduct(state.current,share.dataset.share);return}
  const category=e.target.closest?.("[data-category-filter]");if(category){state.categoryFilter=category.dataset.categoryFilter;document.querySelectorAll("[data-category-filter]").forEach(b=>b.classList.toggle("active",b===category));renderProducts();return}
  const stock=e.target.closest?.("[data-stock-filter]");if(stock){state.stockFilter=stock.dataset.stockFilter;document.querySelectorAll("[data-stock-filter]").forEach(b=>b.classList.toggle("active",b===stock));renderProducts();return}
  const price=e.target.closest?.("[data-price-filter]");if(price){state.priceFilter=price.dataset.priceFilter;document.querySelectorAll("[data-price-filter]").forEach(b=>b.classList.toggle("active",b===price));renderProducts();return}
});
els.search.addEventListener("input",e=>{state.query=e.target.value;renderProducts()});
els.filterBtn.addEventListener("click",()=>{state.filterOpen=!state.filterOpen;els.filterPanel.hidden=!state.filterOpen});
document.querySelectorAll(".collection-tab").forEach(()=>{});
els.cartBtn.addEventListener("click",openCart);
document.getElementById("closeCart").addEventListener("click",closeCart);
els.cartBackdrop.addEventListener("click",closeCart);
document.getElementById("emptyShopNow").addEventListener("click",()=>{closeCart();shopNow()});
document.getElementById("heroShopNow").addEventListener("click",shopNow);
document.getElementById("quickViewClose").addEventListener("click",closeQuick);
els.quickLayer.addEventListener("click",e=>{if(e.target===els.quickLayer)closeQuick()});
document.getElementById("quickViewMinus").addEventListener("click",()=>{state.quickQty=Math.max(1,state.quickQty-1);els.quickQty.textContent=state.quickQty});
document.getElementById("quickViewPlus").addEventListener("click",()=>{state.quickQty=Math.min(10,state.quickQty+1);els.quickQty.textContent=state.quickQty});
document.getElementById("quickViewAdd").addEventListener("click",()=>{if(state.current)addToCart(state.current.id,state.quickQty,document.getElementById("quickViewAdd"))});
document.getElementById("quickViewBuy").addEventListener("click",()=>{if(state.current){if(state.current.real&&state.current.productType!=="physical"){const owned=licenseForProduct(state.current.firestoreId);closeQuick();if(owned){state.upgradeTarget={product:state.current,license:owned};openCheckout()}else{state.cart=[];addToCart(state.current.id,1,null,"buy");openCheckout()}}else buyProduct(state.current,state.quickQty)}});
document.getElementById("quickViewUpgrade").addEventListener("click",()=>{if(state.current){const owned=licenseForProduct(state.current.firestoreId);if(owned){state.upgradeTarget={product:state.current,license:owned};closeQuick();openCheckout();}}});
document.addEventListener("click",async e=>{
  const downloadButton=e.target.closest("[data-download-license]");
  if(downloadButton){
    e.preventDefault();
    await openAuthorizedDownload(downloadButton.dataset.downloadLicense);
    return;
  }const b=e.target.closest("[data-upgrade]");if(!b)return;const p=productById(b.dataset.upgrade);const owned=p&&licenseForProduct(p.firestoreId);if(p&&owned){state.upgradeTarget={product:p,license:owned};openCheckout()}});
document.getElementById("checkoutBtn").addEventListener("click",openCheckout);
document.getElementById("closeCheckout").addEventListener("click",closeCheckout);
document.getElementById("backCheckout").addEventListener("click",()=>{closeCheckout();burstAt(document.getElementById("backCheckout"),5)});
document.getElementById("closeCheckoutX").addEventListener("click",closeCheckout);
document.querySelectorAll(".payment-method").forEach(btn=>btn.addEventListener("click",()=>{
  state.payment=btn.dataset.payment||"card";
  updatePaymentUI();
  burstAt(btn,6);
}));
document.querySelectorAll(".payment-brand-logos img").forEach(img=>img.addEventListener("click",e=>{
  e.stopPropagation();
  const btn=img.closest(".payment-method");
  if(btn){state.payment=btn.dataset.payment||"card";updatePaymentUI();burstAt(btn,6);requestAnimationFrame(()=>document.getElementById("cardholderName")?.focus());}
}));
async function readPaymentReference(){
  const ids={bank:"bankReference",paypal:"paypalReference"};
  const el=document.getElementById(ids[state.payment]||"");
  return String(el?.value||"").trim().slice(0,160);
}
async function openOrderReview(){
  const method=state.payment||"card";
  if(method==="card"){
    notify("Card payments are not enabled in this template. Connect a PCI-compliant payment provider first.");
    return;
  }
  const orderTotal=state.upgradeTarget
    ? parseProductPrice(state.upgradeTarget.product.upgradePrice)
    : total();

  if(state.upgradeTarget){
    try{
      const p=state.upgradeTarget.product, license=state.upgradeTarget.license;
      const result=await upgradeShopProductReal({
        productId:p.firestoreId,
        licenseId:license.id,
        paymentMethod:method,
        paymentReference:await readPaymentReference()
      });
      state.upgradeTarget=null;
      burstAt(document.getElementById("placeOrderBtn"),12);
      openOrderSuccess(orderTotal,method,result?.data?.orderId);
      closeOrderReview();
      return;
    }catch(e){
      console.error("[TUBAL HUB Shop] secure upgrade failed",e);
      notify("Upgrade could not be recorded. The secure shop service may need deployment.");
      return;
    }
  }

  const digitalItems=state.cart.map(x=>({row:x,p:productById(x.id)})).filter(x=>x.p?.real&&x.p.productType!=="physical");
  const physicalItems=state.cart.map(x=>({row:x,p:productById(x.id)})).filter(x=>!x.p?.real||x.p.productType==="physical");
  if(digitalItems.length&&physicalItems.length){notify("Digital and physical products must be purchased separately.");return}

  try{
    const result=await createShopOrderReal({
      items:state.cart.map(x=>{
        const p=productById(x.id);
        return {productId:p?.firestoreId||p?.id,qty:x.qty};
      }),
      paymentMethod:method,
      paymentReference:await readPaymentReference()
    });
    const serverTotal=Number(result?.data?.total);
    const finalTotal=Number.isFinite(serverTotal)?serverTotal:orderTotal;
    burstAt(document.getElementById("placeOrderBtn"),12);
    openOrderSuccess(finalTotal,method,result?.data?.orderId);
    state.cart=[];saveCart();updateCartUI();closeOrderReview();closeCart();
  }catch(e){
    console.error("[TUBAL HUB Shop] secure order failed",e);
    notify("Order could not be recorded. The secure shop service may need deployment.");
  }
});
document.getElementById("closeOrderSuccess").addEventListener("click",closeOrderSuccess);
window.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  if(!els.quickLayer.hidden)closeQuick();
  else if(!document.getElementById("orderSuccessLayer").hidden)closeOrderSuccess();
  else if(!document.getElementById("orderReviewLayer").hidden)closeOrderReview();
  else if(!els.checkoutLayer.hidden)closeCheckout();
  else if(els.cartDrawer.classList.contains("open"))closeCart();
});

loadCart();loadWishlist();updateCounts();updateCartUI();updateCollectionUI();listenToRealProducts();
onAuthStateChanged(auth,user=>listenToOwnedProducts(user));
setTimeout(()=>burstAt(document.getElementById("heroShopNow"),6),450);
