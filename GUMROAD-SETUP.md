# TUBAL HUB — Gumroad Setup Guide

## 1. What the buyer receives

The Gumroad purchase is a source-code/template package. The buyer receives the TUBAL HUB codebase and can customize it, deploy it, and continue making their own versions.

Included core areas:
- TUBAL HUB home
- CTRLZONE games
- Payapang Isip
- Feeds / Community
- Global Chat
- Profiles / Settings
- News / Events
- Shop
- Admin Dashboard
- Firebase Auth / Firestore / Storage
- Cloud Functions
- Security rules and indexes
- Version/update structure

## 2. Create a fresh Firebase project

Do not deploy this package into the seller's Firebase project.

In Firebase:
1. Create a new project.
2. Enable Authentication.
3. Enable the sign-in providers you plan to use.
4. Create Firestore.
5. Create Storage.
6. Register a Web App.
7. Copy the Web App configuration into `assets/js/firebase-config.js`.
8. Copy the same config into `firebase-messaging-sw.js` if push notifications are enabled.

## 3. Configure Firebase CLI

Install Firebase CLI, log in, then select the buyer's project:

```bash
firebase login
firebase use --add
```

Deploy the Firebase resources:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

## 4. Create an admin account

The source uses the Firebase custom claim `admin: true` for protected admin operations.

Set that claim from a trusted server/admin environment using Firebase Admin SDK. Never place an Admin SDK private key in the website or public repository.

Example one-time Node script:

```js
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp({ credential: applicationDefault() });

const uid = "BUYER_USER_UID";
getAuth().setCustomUserClaims(uid, { admin: true })
  .then(() => console.log("Admin claim set."))
  .catch(console.error);
```

After the claim is set, sign out and sign back in so the refreshed ID token contains the new claim.

## 5. AI services

Optional server integrations use environment variables.

Copy `.env.example` into the service's environment and provide the buyer's own API credentials.

Never commit:
- `.env`
- service-account JSON files
- Firebase Admin private keys
- Gemini keys
- Replicate tokens
- other private credentials

## 6. Payment processing

The included Shop order system is not a payment processor.

The template intentionally does not collect card number, expiry, or CVV. Before enabling card payments, integrate a PCI-compliant provider and complete the provider's required webhook/server verification.

For manual workflows, store only non-sensitive payment references.

## 7. GitHub Pages / custom domain

The static frontend can be deployed on GitHub Pages or another static host.

For a custom domain, update any domain-specific configuration such as:
- CORS allowed origin
- API endpoint configuration
- Firebase authorized domains
- web app URL / redirects
- notification links

The Firebase messaging service worker in this edition derives its relative site paths from its own location rather than hard-coding the seller's `/tubalhub/` path.

## 8. Buyer upgrade workflow

The source is intentionally editable. The buyer can make normal code changes, commit them, change the site version, deploy new releases, and continue maintaining their own copy.

## 9. Troubleshooting

If the site opens but Firebase features do not work, check the buyer's Firebase configuration first.

If Admin Dashboard access is denied, verify:
1. the buyer account is authenticated;
2. the account has the `admin: true` custom claim;
3. Cloud Functions are deployed;
4. Firestore rules are deployed;
5. the user signs in again after the claim is changed.

If Shop orders fail, verify the Cloud Functions deployment and the required Firebase resources.

## 10. Security scope

The project includes server-side authorization, Firestore rules, Storage rules, moderation/rate limiting, and protected digital-download logic. These controls reduce common application risks but do not guarantee that a deployed website is impossible to attack. Buyers remain responsible for their own Firebase project, API credentials, hosting, payment provider, monitoring, and updates.
