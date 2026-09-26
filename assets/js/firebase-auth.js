import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const message = (id, text) => { const el = $(id); if (el) el.textContent = text; };

function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email": return "Please enter a valid email address.";
    case "auth/invalid-credential": return "Incorrect email or password.";
    case "auth/email-already-in-use": return "That email is already registered.";
    case "auth/weak-password": return "Choose a stronger password.";
    case "auth/popup-closed-by-user": return "Google sign-in was cancelled.";
    case "auth/popup-blocked": return "Google popup was blocked. Allow pop-ups for this website and try again.";
    case "auth/too-many-requests": return "Too many attempts. Please try again later.";
    case "auth/operation-not-allowed": return "Google sign-in is not enabled in Firebase Console.";
    case "auth/unauthorized-domain": return "This website domain is not authorized in Firebase Authentication.";
    case "auth/invalid-oauth-client-id": return "Google OAuth is not configured correctly in Firebase. Re-enable the Google provider.";
    case "auth/invalid-action-code": return "The Firebase authentication action is invalid or expired. Please start the sign-in again.";
    case "auth/internal-error": return "Firebase authentication encountered an internal error. Please try again.";
    case "auth/invalid-phone-number": return "Enter a valid phone number with country code, e.g. +63...";
    case "auth/quota-exceeded": return "SMS quota reached. Please try again later.";
    case "auth/captcha-check-failed": return "reCAPTCHA verification failed. Please try again.";
    case "auth/missing-phone-number": return "Enter your phone number first.";
    default: return "Authentication failed. Please try again.";
  }
}

// Email / Password sign up
const signupForm = $("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;
    const confirm = $("signupConfirm")?.value;
    message("signupMessage", "");

    if (confirm !== undefined && password !== confirm) {
      message("signupMessage", "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      message("signupMessage", "Password must be at least 6 characters.");
      return;
    }

    try {
      // Create the Firebase account first.
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      // Updating the display name should never prevent a successful signup
      // from redirecting on mobile browsers.
      if (name) {
        try {
          await updateProfile(credential.user, { displayName: name });
        } catch (profileError) {
          console.warn("Profile update failed after successful signup:", profileError);
        }
      }

      // The account is already signed in by createUserWithEmailAndPassword.
      // Use replace() so the mobile browser does not remain on the signup page.
      window.location.replace(new URL("../index.html", window.location.href).href);
    } catch (error) {
      message("signupMessage", friendlyAuthError(error.code));
    }
  });
}

// Email / Password login
const loginForm = $("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    message("loginMessage", "");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.replace(new URL("../index.html", window.location.href).href);
    } catch (error) {
      message("loginMessage", friendlyAuthError(error.code));
    }
  });
}

// Google — popup flow for the website.
// The resolver is loaded only when the user taps Google, keeping startup fast.
const googleButtons = document.querySelectorAll("[data-google-login]");
if (googleButtons.length) {
  googleButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const target = button.dataset.messageTarget || "loginMessage";
      message(target, "");

      // Prevent duplicate taps while the Google window is opening.
      if (button.dataset.googleBusy === "true") return;
      button.dataset.googleBusy = "true";
      const originalText = button.textContent;
      button.disabled = true;

      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        const result = await signInWithPopup(
          auth,
          provider,
          browserPopupRedirectResolver
        );

        if (result?.user) {
          window.location.replace(new URL("../index.html", window.location.href).href);
        }
      } catch (error) {
        console.error("Google sign-in failed:", error);

        if (error.code === "auth/popup-blocked") {
          message(target, "Google popup was blocked. Please allow pop-ups and try again.");
        } else if (error.code === "auth/popup-closed-by-user") {
          message(target, "Google sign-in was cancelled.");
        } else {
          message(target, friendlyAuthError(error.code));
        }
      } finally {
        button.dataset.googleBusy = "false";
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
}

// Anonymous / Guest
const guestButtons = document.querySelectorAll("[data-anonymous-login]");
guestButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    message(button.dataset.messageTarget || "loginMessage", "");
    try {
      await signInAnonymously(auth);
      window.location.replace(new URL("../index.html", window.location.href).href);
    } catch (error) {
      message(button.dataset.messageTarget || "loginMessage", friendlyAuthError(error.code));
    }
  });
});

// Phone authentication
let confirmationResult = null;
let recaptchaVerifier = null;

function setupRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;
  const container = $("recaptcha-container");
  if (!container) return null;
  recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "normal"
  });
  return recaptchaVerifier;
}

const phoneSendButton = $("phoneSendCode");
if (phoneSendButton) {
  phoneSendButton.addEventListener("click", async () => {
    message("phoneMessage", "");
    const phone = $("phoneNumber").value.trim();
    if (!phone) {
      message("phoneMessage", "Enter your phone number first.");
      return;
    }

    try {
      const verifier = setupRecaptcha();
      confirmationResult = await signInWithPhoneNumber(auth, phone, verifier);
      $("phoneCodeBox").hidden = false;
      message("phoneMessage", "Verification code sent by SMS.");
    } catch (error) {
      message("phoneMessage", friendlyAuthError(error.code));
      if (recaptchaVerifier) {
        try { recaptchaVerifier.clear(); } catch {}
        recaptchaVerifier = null;
      }
    }
  });
}

const phoneVerifyButton = $("phoneVerifyCode");
if (phoneVerifyButton) {
  phoneVerifyButton.addEventListener("click", async () => {
    message("phoneMessage", "");
    const code = $("phoneCode").value.trim();
    if (!confirmationResult) {
      message("phoneMessage", "Send the verification code first.");
      return;
    }
    if (!code) {
      message("phoneMessage", "Enter the verification code.");
      return;
    }

    try {
      await confirmationResult.confirm(code);
      window.location.replace(new URL("../index.html", window.location.href).href);
    } catch (error) {
      message("phoneMessage", friendlyAuthError(error.code));
    }
  });
}
