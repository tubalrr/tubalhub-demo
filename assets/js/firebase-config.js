import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

// GUMROAD TEMPLATE:
// Replace every value below with the Firebase Web App config from the BUYER'S
// Firebase project. Never paste a Firebase Admin private key or service-account
// JSON into this client-side file.
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_WEB_APP_ID"
};

const isConfigured = !Object.values(firebaseConfig).some(value =>
  String(value).includes("YOUR_")
);

if (!isConfigured) {
  console.warn("[TUBAL HUB] Firebase is not configured. Follow the Gumroad setup guide before running the site.");
}

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: [
    indexedDBLocalPersistence,
    browserLocalPersistence
  ]
});

export { app, auth };
