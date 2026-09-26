import {app,auth} from "./firebase-config.js";
import {getFirestore,collection,addDoc,query,limit,onSnapshot,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const db=getFirestore(app);
export const HUB_CONTENT_TYPES=["post","product","game","news","video","announcement","event","story"];

export async function publishHubPost(data){
  const user=auth.currentUser;
  if(!user||user.isAnonymous) throw new Error("Sign in required to publish.");
  const payload={
    contentType:data.contentType||"post",
    title:String(data.title||"").slice(0,240),
    text:String(data.text||data.description||"").slice(0,4000),
    imageUrl:String(data.imageUrl||data.image||"").slice(0,3000),
    mediaUrl:String(data.mediaUrl||"").slice(0,3000),
    productUrl:String(data.productUrl||"").slice(0,3000),
    category:String(data.category||"").slice(0,80),
    price:String(data.price??"").slice(0,100),
    stock:String(data.stock??"").slice(0,80),
    authorName:String(data.authorName||user.displayName||"Member").slice(0,120),
    authorPhotoURL:String(data.authorPhotoURL||user.photoURL||"").slice(0,3000),
    createdBy:user.uid,
    sourceCollection:String(data.sourceCollection||"feeds").slice(0,80),
    sourceId:String(data.sourceId||"").slice(0,150),
    destinations:Array.isArray(data.destinations)?data.destinations.slice(0,10):["feeds"],
    status:"published",
    createdAt:serverTimestamp()
  };
  return addDoc(collection(db,"hubPosts"),payload);
}

export function subscribeHubPosts(callback){
  const q=query(collection(db,"hubPosts"),limit(200));
  return onSnapshot(q,snap=>{
    const items=snap.docs.map(d=>({id:d.id,...d.data()}));
    items.sort((a,b)=>{
      const at=a.createdAt?.toMillis?.()||a.createdAt?.seconds*1000||0;
      const bt=b.createdAt?.toMillis?.()||b.createdAt?.seconds*1000||0;
      return bt-at;
    });
    callback(items);
  },err=>console.warn("[TUBAL HUB] hubPosts subscription unavailable",err));
}
