/* TUBAL HUB — Firebase Cloud Messaging service worker
   GUMROAD TEMPLATE: replace the Firebase config below with the BUYER'S project.
*/
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_WEB_APP_ID"
});

const messaging = firebase.messaging();
const logoUrl = new URL("tubal-hub-logo.png", self.location.href).href;
const chatUrl = new URL("pages/chat.html", self.location.href).href;

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const name = data.callerName || "Member";
  const callId = data.callId || "call";

  self.registration.showNotification("TUBAL HUB — Incoming Call", {
    body: name + " is calling you on TUBAL HUB.",
    icon: logoUrl,
    badge: logoUrl,
    tag: "tubalhub-call-" + callId,
    renotify: true,
    requireInteraction: true,
    data: {
      url: chatUrl,
      callId
    },
    actions: [
      { action: "open", title: "Open Call" },
      { action: "dismiss", title: "Dismiss" }
    ]
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if(event.action === "dismiss") return;

  const target = new URL(
    event.notification.data?.url || chatUrl,
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
      for(const client of list){
        if("focus" in client){
          client.navigate(target).catch(()=>{});
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(target);
    })
  );
});
