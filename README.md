
## 🧪 Real Data / Demo Mode

TUBAL HUB follows a **Real data only - no fake** rule by default. Empty states intentionally stay empty when there is no saved or connected content. For a buyer/demo preview, optional demo content is loaded only when the buyer explicitly clicks **Load Demo Content (labeled as demo)**. Demo entries carry a visible **[DEMO]** label and are not used as real activity.

All empty states are intentional. Real journals, feeds, cart data, and connected content appear only when actual data exists in browser storage, Firebase, or repository-backed JSON data.
# TUBAL HUB

**Three Brands. One Hub.**

TUBAL HUB is a modern gaming, creative, community, and digital-content platform built for the web and mobile WebView experience.

## 🌐 Preview / Deployment

This Gumroad edition does not ship with the seller's live Firebase project or production domain. Configure your own Firebase project, hosting domain, and API services before deployment.

## 📰 TUBAL HUB Feeds

The Feeds page is the main social-content stream for published TUBAL HUB content.

### Features
- Premium original TUBAL HUB social-feed design
- Glassmorphism with 20px blur and neon green `#1dff91` + purple `#7d5aff`
- Midnight, Forest, and Light visual themes with distinct styles
- Real published content from the shared `hubPosts` stream
- Search, filters, latest/popular sorting, saved-feed mode, and progressive loading
- Reactions: Like, Love, Haha, Wow, Sad, and Angry
- Reaction picker with hover/long-press behavior, haptic feedback, animated bursts, reaction summaries, and reactor list
- Nested comments and replies with edit/delete controls
- Emoji picker, photo/GIF attachment preview, typing indicator, and comment reactions
- Share sheet for Facebook, Messenger, WhatsApp, X/Twitter, Instagram, Telegram, Email, Discord, and Copy Link
- Native Web Share API support when available
- Mouse spotlight effects and GPU-friendly interaction animations
- Real online/offline status indicators where presence data is available
- Trending Now, Active in Games, and Suggested for you sidebar sections
- No placeholder members, fake engagement totals, or invented published content

## 🔁 Unified Content Distribution

TUBAL HUB uses a shared `hubPosts` content stream so a single publication can appear in the appropriate hub surfaces.

### Routing
- **Post** → Feeds + Community
- **Product** → Feeds + Shop
- **Game** → Feeds + Games
- **News** → Feeds + News
- **Video** → Feeds + News
- **Event** → Feeds + Events
- **Announcement** → Feeds + News + Community
- **Story** → Feeds + News

Admin publishing tools can create and mirror content into the shared stream. Firestore rules validate allowed content types, destinations, titles, text, and authenticated ownership.

> Firestore rules stored in the repository must still be deployed to the Firebase project before rule changes become active in production.

## 🎮 CTRLZONE — Games Library

CTRLZONE now includes a full **Games Library** instead of featured games only.

### Features
- 🔎 Game search
- 🗂️ Genre filtering
- 🎮 29+ games
- 🖼️ Game logo support
- 🔗 Official game links
- 📱 Responsive mobile layout
- ⚡ Lazy-loaded game logos
- 🌌 Glassmorphism / futuristic CTRLZONE design

### Game Categories
- MOBA
- FPS
- Battle Royale
- Sandbox
- Simulation
- Strategy
- Racing
- RPG

### Featured Games
Mobile Legends: Bang Bang, Honor of Kings, League of Legends, Dota 2, Pokémon Unite, VALORANT, Counter-Strike 2, Call of Duty, PUBG: Battlegrounds, Apex Legends, Fortnite, Minecraft, Roblox, Terraria, Ultimate Bus Simulator, Euro Truck Simulator 2, Cities: Skylines, The Sims 4, Transport Fever 2, Civilization VI, Age of Empires IV, StarCraft II, Forza Horizon 5, Assetto Corsa, Need for Speed Heat, Genshin Impact, Honkai: Star Rail, Elden Ring, and Final Fantasy XIV.

## 🧩 Main Platforms

### 🌌 TUBAL HUB
The main platform for navigation, community features, gaming, news, shop, profiles, and digital content.

### ⚡ CTRLZONE
Gaming and creator command center featuring:
- Games Library
- Gaming highlights
- Creative content
- Motivation
- Gaming discovery

### 🌿 Payapang Isip
Nature-inspired digital space focused on peaceful, creative, and AI-assisted experiences.

## 🛒 Shop

The Shop supports:
- Mods
- Digital products
- Music & Media
- Product management through the admin dashboard
- Firestore-based product loading
- Checkout foundation

> Real payment processing requires a secure backend/payment provider. Payment secrets must never be placed in client-side code.

## 📰 News

The platform includes a modern News section with admin-managed content and categories for platform, community, and creator updates.

## 👥 Community & Global Chat

- Community hub
- Global chat
- User profiles
- Moderation tools
- Timed chat bans and mute controls
- Admin moderation
- Firebase Authentication / Firestore integration

## 🤖 AI Companion

TUBAL HUB includes a lightweight local AI Companion designed to answer questions about the platform and its features.

The current website chatbot uses a local knowledge engine rather than sending requests to an external AI API, helping keep the site lightweight and avoiding unnecessary API quota usage.

## 🎨 Themes

The website includes a global theme system with multiple visual modes:

- Galaxy
- Forest
- Neon Green
- Aurora
- Nebula
- Nexus Aurora Pro
- Dark Glassmorphism / Aurora Mesh

Themes can be changed from the Settings page and are stored locally for the user's browser.

## 🔐 Authentication

Firebase Authentication supports the website's account system, including:
- Google sign-in
- Guest/anonymous access where enabled
- User profiles
- Persistent authentication

Firestore security rules are designed to restrict administrative operations to authorized admin accounts.

## 📱 Mobile / WebView

TUBAL HUB is designed to work on:
- Desktop browsers
- Mobile browsers
- Android WebView-based applications

Responsive layouts, mobile navigation, touch-friendly controls, and local storage support are included throughout the platform.

## 📁 Project Structure

```
/
├── index.html
├── tubal-hub-logo.png
├── LICENSE.md
├── README.md
├── assets/
│   ├── css/
│   ├── js/
│   └── images/
├── admin/
│   └── admin.html
└── pages/
    ├── ctrlzone.html
    ├── payapang-isip.html
    ├── shop.html
    ├── news.html
    ├── community.html
    ├── chat.html
    ├── profiles.html
    ├── settings.html
    ├── contact.html
    ├── license.html
    ├── privacy.html
    ├── cookies.html
    └── terms.html
```

## 🛠️ Technology

- HTML5
- CSS3
- JavaScript
- Firebase Authentication
- Firebase Firestore
- GitHub Pages
- Android WebView compatibility

## 📱 Google Play Store

[Open Google Play Store](https://play.google.com/store/games?gl=PH)

## 📜 License

TUBAL HUB is distributed under the custom **TUBAL HUB Website License** in [LICENSE.md](LICENSE.md).

The website is intended for personal and non-commercial viewing unless permission is granted for other use. Third-party trademarks, logos, games, and other assets remain the property of their respective owners.

## © Copyright

© 2026 TUBAL HUB — All Rights Reserved.

Built and maintained by **TUBAL HUB**.


## 🛍️ Gumroad Source-Code Edition

This branch is prepared as a buyer-facing source-code distribution edition.

### Before deployment
1. Create a NEW Firebase project for the buyer.
2. Create a Web App in that Firebase project and replace the values in `assets/js/firebase-config.js`.
3. Replace the Firebase config in `firebase-messaging-sw.js`.
4. Deploy `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and `functions/` to the buyer's Firebase project.
5. Set the buyer's authenticated user with the Firebase custom claim `admin: true`.
6. Configure server-only environment variables from `.env.example`.
7. Review third-party assets, domains, logos, API quotas, and payment-provider requirements before commercial launch.

### Important payment note
The template does not store card numbers, expiry dates, or CVV. The built-in manual order flow is intended for bank-transfer or PayPal-style reference workflows until the buyer connects a PCI-compliant payment provider.

### Distribution
The purchaser may customize and deploy the source under the included source-code license. The purchaser may not redistribute or resell the source code as a competing template or source-code pack.

See:
- `GUMROAD-SETUP.md`
- `GUMROAD-LISTING.md`
- `TUBAL-HUB-SOURCE-CODE-LICENSE.md`
