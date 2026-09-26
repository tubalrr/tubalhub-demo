
const { logger } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

initializeApp();
const db = getFirestore();

const BANNED_WORDS_REAL = [
  "fuck", "fucking", "shit", "bitch", "asshole", "bastard", "damn",
  "puta", "putangina", "putang ina", "gago", "tanga", "bobo", "ulol",
  "tarantado", "leche", "bwisit", "buwisit", "hayop", "hinayupak",
  "pakyu", "p*tangina", "p*tang ina", "g*go", "t*nga", "b*bo",
  "bw3sit", "bwesit"
];

const BANNED_PATTERNS_REAL = [
  /p[\\s._*\\-]*[u@][\\s._*\\-]*t[\\s._*\\-]*[a@][\\s._*\\-]*ng[\\s._*\\-]*[i1][\\s._*\\-]*n[\\s._*\\-]*a/i,
  /g[\\s._*\\-]*[a@][\\s._*\\-]*g[\\s._*\\-]*o/i,
  /b[\\s._*\\-]*[o0][\\s._*\\-]*b[\\s._*\\-]*o/i,
  /t[\\s._*\\-]*[a@][\\s._*\\-]*ng[\\s._*\\-]*[a@]/i,
  /f[\\s._*\\-]*u[\\s._*\\-]*c[\\s._*\\-]*k/i,
  /s[\\s._*\\-]*h[\\s._*\\-]*i[\\s._*\\-]*t/i
];

function normalizeReal(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[._*\\-]+/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function escapedWordPattern(word) {
  const escaped = String(word).replace(/[.*+?^$()|[\\]\\\\]/g, "\\$&");
  return new RegExp("(?<![a-z0-9])" + escaped + "(?![a-z0-9])", "i");
}
function moderateServerReal(text) {
  const raw = String(text || "").trim();
  if (!raw) return { allowed: false, flagged: false, reason: "empty", cleanText: "" };

  let clean = raw;
  const found = new Set();
  const normalized = normalizeReal(raw);

  for (const word of BANNED_WORDS_REAL) {
    const pattern = escapedWordPattern(word);
    if (pattern.test(raw) || pattern.test(normalized)) {
      found.add(word);
      clean = clean.replace(pattern, "***");
    }
  }

  for (const pattern of BANNED_PATTERNS_REAL) {
    if (pattern.test(raw)) {
      found.add(pattern.source);
      clean = clean.replace(pattern, "***");
    }
  }

  const reasons = Array.from(found);
  if (reasons.length >= 3) {
    return { allowed: false, flagged: true, reason: reasons.join(","), cleanText: clean };
  }
  if (reasons.length > 0) {
    return { allowed: true, flagged: true, reason: reasons.join(","), cleanText: clean };
  }
  return { allowed: true, flagged: false, reason: "", cleanText: raw };
}

function requireRealUser(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Login muna.");
  }
  if (request.auth.token && request.auth.token.firebase &&
      request.auth.token.firebase.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Anonymous login is not allowed.");
  }
}

function requireAdminUser(request) {
  requireRealUser(request);
  const token = request.auth.token || {};
  if (token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

function displayNameFromRequest(request) {
  return (request.auth.token && request.auth.token.name) ||
    (request.auth.token && request.auth.token.email ? request.auth.token.email.split("@")[0] : "") ||
    "Member";
}

function channelToFirestoreReal(value) {
  const map = {
    general: "global-chat",
    "payapang-isip": "payapang-isip",
    payapang: "payapang-isip",
    ctrlzone: "ctrlzone",
    "shop-talk": "shop-talk",
    shop: "shop-talk",
    announcements: "announcements"
  };
  return map[String(value || "")] || null;
}

async function enforceRateLimitReal(uid) {
  const ref = db.collection("rateLimits").doc(uid);
  const now = Date.now();

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const last = snap.exists ? Number(snap.data().lastMessageAtMs || 0) : 0;

    if (last && now - last < 2000) {
      throw new HttpsError("resource-exhausted", "Please wait a moment before sending another message.");
    }

    tx.set(ref, {
      uid,
      lastMessageAtMs: now,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}


async function markChatMediaExpiredReal(fileName, storagePath) {
  const matches = new Map();

  const queries = [
    db.collection("globalChats").where("storagePath", "==", storagePath),
    db.collection("globalChats").where("storagePathReal", "==", storagePath)
  ];

  if (fileName) {
    queries.push(db.collection("globalChats").where("fileNameReal", "==", fileName));
  }

  for (const queryRef of queries) {
    try {
      const snap = await queryRef.get();
      snap.forEach(docSnap => matches.set(docSnap.id, docSnap.ref));
    } catch (error) {
      logger.warn("Could not locate Global Chat media document.", {
        fileName,
        storagePath,
        error: error?.message || String(error)
      });
    }
  }

  for (const ref of matches.values()) {
    try {
      await ref.update({
        mediaUrl: FieldValue.delete(),
        imageUrlReal: FieldValue.delete(),
        hasImageReal: false,
        imageExpiredReal: true,
        expiredAt: FieldValue.serverTimestamp()
      });
    } catch (error) {
      logger.warn("Could not mark Global Chat media document expired.", {
        fileName,
        storagePath,
        error: error?.message || String(error)
      });
    }
  }

  return matches.size;
}

async function writeModerationLogReal(data) {
  await db.collection("moderationLogs").add(Object.assign({}, data, {
    createdAt: FieldValue.serverTimestamp(),
    isReal: true
  }));
}

async function recordStrikeReal(uid, reason, channel, messageId) {
  if (!uid) return;

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const current = Number((userSnap.data() && userSnap.data().strikesReal) || 0);
  const strikes = current + 1;

  const patch = {
    strikesReal: strikes,
    lastStrikeAt: FieldValue.serverTimestamp(),
    lastModerationReasonReal: reason || "",
    lastModerationMessageIdReal: messageId || ""
  };

  if (strikes >= 3) {
    patch.chatStatus = "banned";
    patch.banUntil = new Date(Date.now() + 10 * 60 * 1000);
    patch.banReason = "Repeated offensive language detected by server moderation.";
    patch.moderatedBy = "server";
    patch.moderatedAt = FieldValue.serverTimestamp();
  }

  await userRef.set(patch, { merge: true });

  if (strikes >= 3) {
    await writeModerationLogReal({
      typeReal: "auto_ban_10m",
      uid,
      strikesReal: strikes,
      channel: channel || "",
      messageId: messageId || "",
      reasonReal: reason || ""
    });
  }
}

exports.moderateGlobalChatReal = onDocumentCreated("globalChats/{msgId}", async event => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() || {};
  if (data.verifiedReal === true && data.moderatedBy === "server") return;

  const text = String(data.text || data.textReal || "").trim();
  if (!text) return;

  const result = moderateServerReal(text);

  if (!result.allowed) {
    await snap.ref.delete();

    await writeModerationLogReal({
      typeReal: "blocked",
      originalTextReal: text,
      reasonReal: result.reason,
      uid: data.uid || "",
      channel: data.channel || "",
      messageId: snap.id
    });

    await recordStrikeReal(data.uid, result.reason, data.channel, snap.id);
    return;
  }

  if (result.flagged) {
    await snap.ref.update({
      text: result.cleanText,
      textReal: result.cleanText,
      moderatedReal: true,
      flaggedReal: true,
      moderationReasonReal: result.reason,
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });

    await writeModerationLogReal({
      typeReal: "flagged",
      originalTextReal: text,
      cleanTextReal: result.cleanText,
      reasonReal: result.reason,
      uid: data.uid || "",
      channel: data.channel || "",
      messageId: snap.id
    });
  } else {
    await snap.ref.update({
      verifiedReal: true,
      verifiedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });
  }
});

exports.moderateGlobalChatReplyReal = onDocumentCreated("globalChatReplies/{replyId}", async event => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() || {};
  if (data.verifiedReal === true && data.moderatedBy === "server") return;

  const text = String(data.text || data.textReal || "").trim();
  if (!text) {
    await snap.ref.delete();
    return;
  }

  const result = moderateServerReal(text);

  if (!result.allowed) {
    await snap.ref.delete();

    await writeModerationLogReal({
      typeReal: "reply_blocked",
      originalTextReal: text,
      reasonReal: result.reason,
      uid: data.uid || "",
      messageId: data.messageId || "",
      replyId: snap.id
    });

    await recordStrikeReal(data.uid, result.reason, "reply", snap.id);
    return;
  }

  if (result.flagged) {
    await snap.ref.update({
      text: result.cleanText,
      textReal: result.cleanText,
      moderatedReal: true,
      flaggedReal: true,
      moderationReasonReal: result.reason,
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });

    await writeModerationLogReal({
      typeReal: "reply_flagged",
      originalTextReal: text,
      cleanTextReal: result.cleanText,
      reasonReal: result.reason,
      uid: data.uid || "",
      messageId: data.messageId || "",
      replyId: snap.id
    });
  } else {
    await snap.ref.update({
      verifiedReal: true,
      verifiedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });
  }
});

exports.moderatePrivateChatReal = onDocumentCreated("messages/{messageId}", async event => {
  const snap = event.data;
  if (!snap) return;

  const data = snap.data() || {};
  if (data.verifiedReal === true && data.moderatedBy === "server") return;

  const text = String(data.text || data.textReal || "").trim();
  if (!text) {
    if (data.type === "text") await snap.ref.delete();
    return;
  }

  const result = moderateServerReal(text);

  if (!result.allowed) {
    await snap.ref.delete();

    await writeModerationLogReal({
      typeReal: "private_blocked",
      originalTextReal: text,
      reasonReal: result.reason,
      fromUid: data.senderId || data.uid || "",
      toUid: data.receiverId || "",
      messageId: snap.id
    });

    await recordStrikeReal(data.senderId || data.uid, result.reason, "private", snap.id);
    return;
  }

  if (result.flagged) {
    await snap.ref.update({
      text: result.cleanText,
      textReal: result.cleanText,
      moderatedReal: true,
      flaggedReal: true,
      moderationReasonReal: result.reason,
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });
  } else {
    await snap.ref.update({
      verifiedReal: true,
      verifiedAt: FieldValue.serverTimestamp(),
      moderatedBy: "server"
    });
  }
});

exports.sendMessageReal = onCall(async request => {
  requireRealUser(request);

  const textReal = String((request.data && (request.data.text || request.data.textReal)) || "").trim();
  const channel = channelToFirestoreReal(request.data && request.data.channel);

  if (!textReal || textReal.length > 500) {
    throw new HttpsError("invalid-argument", "Text must be 1-500 characters.");
  }

  if (!channel) {
    throw new HttpsError("invalid-argument", "Invalid channel.");
  }

  const moderation = moderateServerReal(textReal);
  if (!moderation.allowed) {
    await writeModerationLogReal({
      typeReal: "callable_blocked",
      originalTextReal: textReal,
      reasonReal: moderation.reason,
      uid: request.auth.uid,
      channel
    });
    await recordStrikeReal(request.auth.uid, moderation.reason, channel, "");
    throw new HttpsError("invalid-argument", "Offensive language is not allowed.");
  }

  await enforceRateLimitReal(request.auth.uid);

  const name = displayNameFromRequest(request);
  const token = request.auth.token || {};
  const docData = {
    uid: request.auth.uid,
    displayName: name,
    name: name,
    email: token.email || "",
    photoURL: token.picture || "",
    createdAt: FieldValue.serverTimestamp(),
    text: moderation.cleanText,
    textReal: moderation.cleanText,
    type: "text",
    channel,
    moderatedReal: !!moderation.flagged,
    flaggedReal: !!moderation.flagged,
    verifiedReal: true,
    roleReal: (request.auth.token?.admin === true) ? "admin" : "user",
    moderatedBy: "server"
  };

  const replyTo = request.data && request.data.replyTo;
  if (replyTo && typeof replyTo === "object" && typeof replyTo.name === "string") {
    docData.replyTo = {
      name: replyTo.name.slice(0, 120),
      preview: String(replyTo.preview || "").slice(0, 160)
    };
  }

  const ref = await db.collection("globalChats").add(docData);

  if (moderation.flagged) {
    await writeModerationLogReal({
      typeReal: "callable_flagged",
      originalTextReal: textReal,
      cleanTextReal: moderation.cleanText,
      reasonReal: moderation.reason,
      uid: request.auth.uid,
      channel,
      messageId: ref.id
    });
  }

  return {
    success: true,
    id: ref.id,
    moderated: !!moderation.flagged,
    cleanText: moderation.cleanText
  };
});

exports.sendGlobalMediaMessageReal = onCall(async request => {
  requireRealUser(request);

  const type = String(request.data?.type || "");
  const channel = channelToFirestoreReal(request.data?.channel);
  const mediaUrl = String(request.data?.mediaUrl || "").trim();
  const storagePath = String(request.data?.storagePath || "").trim();
  const textReal = String(request.data?.text || request.data?.textReal || "").trim();

  if (!["image", "gif"].includes(type) || !channel || !mediaUrl || mediaUrl.length > 3000) {
    throw new HttpsError("invalid-argument", "Invalid media message.");
  }
  if (textReal.length > 500) {
    throw new HttpsError("invalid-argument", "Caption must be 500 characters or less.");
  }

  if (storagePath && !storagePath.startsWith("global-chat/" + request.auth.uid + "/")) {
    throw new HttpsError("permission-denied", "Invalid media ownership.");
  }

  const moderation = textReal
    ? moderateServerReal(textReal)
    : { allowed: true, flagged: false, cleanText: "", reason: "" };

  if (!moderation.allowed) {
    await writeModerationLogReal({
      typeReal: "media_callable_blocked",
      originalTextReal: textReal,
      reasonReal: moderation.reason,
      uid: request.auth.uid,
      channel
    });
    await recordStrikeReal(request.auth.uid, moderation.reason, channel, "");
    throw new HttpsError("invalid-argument", "Media caption blocked by server moderation.");
  }

  await enforceRateLimitReal(request.auth.uid);

  const name = displayNameFromRequest(request);
  const token = request.auth.token || {};
  const roleReal = token.admin === true ? "admin" : "user";
  const ref = await db.collection("globalChats").add({
    uid: request.auth.uid,
    displayName: name,
    name,
    email: token.email || "",
    photoURL: token.picture || "",
    createdAt: FieldValue.serverTimestamp(),
    type,
    channel,
    mediaUrl,
    storagePath,
    storagePathReal: storagePath,
    text: moderation.cleanText,
    textReal: moderation.cleanText,
    roleReal,
    moderatedReal: !!moderation.flagged,
    flaggedReal: !!moderation.flagged,
    verifiedReal: true,
    moderatedBy: "server"
  });

  return { success: true, id: ref.id, moderated: !!moderation.flagged };
});

exports.sendReplyReal = onCall(async request => {
  requireRealUser(request);

  const textReal = String((request.data && (request.data.text || request.data.textReal)) || "").trim();
  const messageId = String((request.data && request.data.messageId) || "");
  const parentReplyId = request.data && request.data.parentReplyId ? String(request.data.parentReplyId) : null;

  if (!messageId || !textReal || textReal.length > 500) {
    throw new HttpsError("invalid-argument", "Reply and messageId are required. Text must be 1-500 characters.");
  }

  const parentMessage = await db.collection("globalChats").doc(messageId).get();
  if (!parentMessage.exists) {
    throw new HttpsError("not-found", "Original message not found.");
  }

  const moderation = moderateServerReal(textReal);
  if (!moderation.allowed) {
    await writeModerationLogReal({
      typeReal: "reply_callable_blocked",
      originalTextReal: textReal,
      reasonReal: moderation.reason,
      uid: request.auth.uid,
      messageId
    });
    await recordStrikeReal(request.auth.uid, moderation.reason, "reply", messageId);
    throw new HttpsError("invalid-argument", "Offensive language is not allowed.");
  }

  await enforceRateLimitReal(request.auth.uid);

  const ref = await db.collection("globalChatReplies").add({
    messageId,
    parentReplyId,
    uid: request.auth.uid,
    displayName: displayNameFromRequest(request),
    email: (request.auth.token && request.auth.token.email) || "",
    text: moderation.cleanText,
    textReal: moderation.cleanText,
    createdAt: FieldValue.serverTimestamp(),
    moderatedReal: !!moderation.flagged,
    flaggedReal: !!moderation.flagged,
    verifiedReal: true,
    moderatedBy: "server"
  });

  return {
    success: true,
    id: ref.id,
    moderated: !!moderation.flagged,
    cleanText: moderation.cleanText
  };
});

function parseShopPriceReal(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /^free$/i.test(raw)) return 0;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeShopItemsReal(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new HttpsError("invalid-argument", "Invalid shop items.");
  }
  return items.map(item => {
    const productId = String(item?.productId || "").trim();
    const qty = Number(item?.qty);
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw new HttpsError("invalid-argument", "Invalid shop item.");
    }
    return { productId, qty };
  });
}

async function reserveShopOrderSlotReal(tx, uid) {
  const ref = db.collection("shopRateLimits").doc(uid);
  const snap = await tx.get(ref);
  const now = Date.now();
  const data = snap.exists ? snap.data() || {} : {};
  const windowStart = Number(data.windowStartMs || 0);
  const withinWindow = windowStart > 0 && now - windowStart < 60 * 60 * 1000;
  const windowCount = withinWindow ? Number(data.windowCount || 0) : 0;
  const pendingCount = Number(data.pendingCount || 0);

  if (pendingCount >= 5) {
    throw new HttpsError("resource-exhausted", "You already have the maximum number of pending shop orders.");
  }
  if (windowCount >= 10) {
    throw new HttpsError("resource-exhausted", "Too many shop orders. Please try again later.");
  }

  tx.set(ref, {
    uid,
    windowStartMs: withinWindow ? windowStart : now,
    windowCount: windowCount + 1,
    pendingCount: pendingCount + 1,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function releaseShopOrderSlotReal(tx, uid) {
  const ref = db.collection("shopRateLimits").doc(uid);
  // Do not read here: this helper is called after other transaction writes.
  // Firestore requires all transaction reads to happen before writes.
  tx.set(ref, {
    uid,
    pendingCount: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function getShopProductsReal(items) {
  const refs = items.map(item => db.collection("products").doc(item.productId));
  const snaps = await db.getAll(...refs);
  return snaps.map((snap, index) => {
    if (!snap.exists) {
      throw new HttpsError("not-found", "A selected product no longer exists.");
    }
    return { id: snap.id, data: snap.data() || {}, qty: items[index].qty };
  });
}

exports.createShopOrderReal = onCall(async request => {
  requireRealUser(request);

  const items = normalizeShopItemsReal(request.data?.items);
  const paymentMethod = String(request.data?.paymentMethod || "").slice(0, 80) || "Manual payment";
  const paymentReference = String(request.data?.paymentReference || "").trim().slice(0, 160);
  const products = await getShopProductsReal(items);

  let total = 0;
  const orderItems = [];
  let hasDigital = false;
  let hasPhysical = false;

  for (const item of products) {
    const p = item.data;
    const price = parseShopPriceReal(p.price);
    if (price === null) {
      throw new HttpsError("failed-precondition", "A selected product has an invalid price.");
    }

    const productType = String(p.productType || "physical").slice(0, 60);
    if (productType === "physical") hasPhysical = true;
    else hasDigital = true;

    total += price * item.qty;
    orderItems.push({
      productId: item.id,
      title: String(p.name || "Product").slice(0, 240),
      qty: item.qty,
      price: String(p.price ?? "Free").slice(0, 100),
      productType,
      version: p.version ? String(p.version).slice(0, 80) : null,
      latestVersion: String(p.latestVersion || p.version || "1.0.0").slice(0, 80),
      licenseType: String(p.license || "Standard").slice(0, 100)
    });
  }

  if (hasDigital && hasPhysical) {
    throw new HttpsError("failed-precondition", "Digital and physical products must be purchased separately.");
  }

  const orderRef = db.collection("orders").doc();
  await db.runTransaction(async tx => {
    await reserveShopOrderSlotReal(tx, request.auth.uid);
    tx.set(orderRef, {
      uid: request.auth.uid,
      items: orderItems,
      total,
      paymentMethod,
      paymentReference,
      status: "pending_payment",
      paymentVerified: false,
      createdAt: FieldValue.serverTimestamp(),
      createdByServer: true
    });
  });

  return {
    success: true,
    orderId: orderRef.id,
    total,
    status: "pending_payment",
    licenseIds: []
  };
});

exports.upgradeShopProductReal = onCall(async request => {
  requireRealUser(request);

  const productId = String(request.data?.productId || "").trim();
  const licenseId = String(request.data?.licenseId || "").trim();
  const paymentMethod = String(request.data?.paymentMethod || "").slice(0, 80) || "Manual payment";
  const paymentReference = String(request.data?.paymentReference || "").trim().slice(0, 160);

  if (!productId || !licenseId) {
    throw new HttpsError("invalid-argument", "Product and license are required.");
  }

  const result = await db.runTransaction(async tx => {
    const productRef = db.collection("products").doc(productId);
    const licenseRef = db.collection("licenses").doc(licenseId);
    const productSnap = await tx.get(productRef);
    const licenseSnap = await tx.get(licenseRef);

    if (!productSnap.exists || !licenseSnap.exists) {
      throw new HttpsError("not-found", "Product or license not found.");
    }

    const p = productSnap.data() || {};
    const license = licenseSnap.data() || {};

    if (license.uid !== request.auth.uid || license.productId !== productId) {
      throw new HttpsError("permission-denied", "This license does not belong to the signed-in user.");
    }

    const latestVersion = String(p.latestVersion || p.version || "");
    const currentVersion = String(license.ownedVersion || "");
    if (!latestVersion || latestVersion === currentVersion) {
      throw new HttpsError("failed-precondition", "This product is already up to date.");
    }

    const upgradePrice = parseShopPriceReal(p.upgradePrice);
    if (upgradePrice === null) {
      throw new HttpsError("failed-precondition", "This product has an invalid upgrade price.");
    }

    const orderRef = db.collection("orders").doc();
    const upgradeRef = db.collection("upgrades").doc();
    await reserveShopOrderSlotReal(tx, request.auth.uid);
    tx.set(orderRef, {
      uid: request.auth.uid,
      type: "upgrade",
      productId,
      licenseId,
      upgradeId: upgradeRef.id,
      total: upgradePrice,
      paymentMethod,
      paymentReference,
      status: "pending_payment",
      paymentVerified: false,
      createdAt: FieldValue.serverTimestamp(),
      createdByServer: true
    });

    tx.set(upgradeRef, {
      uid: request.auth.uid,
      orderId: orderRef.id,
      productId,
      licenseId,
      fromVersion: currentVersion,
      toVersion: latestVersion,
      price: String(p.upgradePrice ?? "Free").slice(0, 100),
      downloadUrl: String(p.downloadUrl || "").slice(0, 3000),
      status: "pending_payment",
      createdAt: FieldValue.serverTimestamp(),
      createdByServer: true
    });

    // IMPORTANT: ownership is not changed here. It is unlocked only by
    // verifyShopOrderReal after an administrator verifies the manual payment.

    return {
      orderId: orderRef.id,
      upgradeId: upgradeRef.id,
      latestVersion,
      status: "pending_payment"
    };
  });

  return { success: true, ...result };
});

exports.verifyShopOrderReal = onCall(async request => {
  requireAdminUser(request);

  const orderId = String(request.data?.orderId || "").trim();
  const approved = request.data?.approved === true;
  const paymentReference = String(request.data?.paymentReference || "").trim().slice(0, 160);
  const verificationNote = String(request.data?.verificationNote || "").trim().slice(0, 500);

  if (!orderId) {
    throw new HttpsError("invalid-argument", "Order ID is required.");
  }

  const orderRef = db.collection("orders").doc(orderId);

  if (!approved) {
    const rejected = await db.runTransaction(async tx => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

      const order = orderSnap.data() || {};
      if (order.status === "paid") {
        return { alreadyPaid: true, status: "paid" };
      }
      if (order.status !== "pending_payment") {
        throw new HttpsError("failed-precondition", "Only pending-payment orders can be rejected.");
      }

      await releaseShopOrderSlotReal(tx, order.uid);
      tx.update(orderRef, {
        status: "rejected",
        paymentVerified: false,
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: request.auth.uid,
        verificationNote,
        updatedAt: FieldValue.serverTimestamp()
      });
      return { alreadyPaid: false, status: "rejected" };
    });

    return { success: true, ...rejected };
  }

  const result = await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");

    const order = orderSnap.data() || {};
    if (order.status === "paid") {
      return { alreadyPaid: true, status: "paid", licenseIds: [] };
    }
    if (order.status !== "pending_payment") {
      throw new HttpsError("failed-precondition", "Only pending-payment orders can be verified.");
    }

    const licenseIds = [];
    const upgradeIds = [];

    if (order.type === "upgrade") {
      const upgradeId = String(order.upgradeId || "");
      const licenseId = String(order.licenseId || "");
      if (!upgradeId || !licenseId) {
        throw new HttpsError("failed-precondition", "Upgrade order is missing ownership references.");
      }

      const upgradeRef = db.collection("upgrades").doc(upgradeId);
      const licenseRef = db.collection("licenses").doc(licenseId);
      const upgradeSnap = await tx.get(upgradeRef);
      const licenseSnap = await tx.get(licenseRef);

      if (!upgradeSnap.exists || !licenseSnap.exists) {
        throw new HttpsError("not-found", "Upgrade or license record not found.");
      }

      const upgrade = upgradeSnap.data() || {};
      const license = licenseSnap.data() || {};
      if (
        license.uid !== order.uid
        || upgrade.uid !== order.uid
        || upgrade.orderId !== orderId
        || upgrade.productId !== order.productId
        || upgrade.licenseId !== licenseId
        || order.licenseId !== licenseId
        || order.productId !== upgrade.productId
      ) {
        throw new HttpsError("failed-precondition", "Upgrade ownership records do not match.");
      }
      if (upgrade.status === "paid") {
        tx.update(orderRef, {
          status: "paid",
          paymentVerified: true,
          verifiedAt: FieldValue.serverTimestamp(),
          verifiedBy: request.auth.uid,
          verificationNote,
          paymentReference: paymentReference || order.paymentReference || "",
          updatedAt: FieldValue.serverTimestamp()
        });
        return { alreadyPaid: true, status: "paid", licenseIds: [licenseId] };
      }
      if (upgrade.status !== "pending_payment") {
        throw new HttpsError("failed-precondition", "Upgrade is not awaiting payment verification.");
      }

      const targetVersion = String(upgrade.toVersion || "").trim();
      const currentVersion = String(license.ownedVersion || "").trim();
      if (!targetVersion || targetVersion === currentVersion) {
        throw new HttpsError("failed-precondition", "License is already on the requested version.");
      }

      tx.update(licenseRef, {
        ownedVersion: targetVersion,
        latestVersion: targetVersion,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(upgradeRef, {
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: request.auth.uid,
        verificationNote,
        paymentReference: paymentReference || order.paymentReference || ""
      });

      const downloadRef = db.collection("downloads").doc("order-" + orderId + "-" + licenseId);
      tx.set(downloadRef, {
        uid: order.uid,
        orderId,
        productId: String(order.productId || upgrade.productId || ""),
        version: targetVersion,
        createdAt: FieldValue.serverTimestamp(),
        createdByServer: true
      }, { merge: true });

      await releaseShopOrderSlotReal(tx, order.uid);
      tx.update(orderRef, {
        status: "paid",
        paymentVerified: true,
        verifiedAt: FieldValue.serverTimestamp(),
        verifiedBy: request.auth.uid,
        verificationNote,
        paymentReference: paymentReference || order.paymentReference || "",
        updatedAt: FieldValue.serverTimestamp()
      });

      upgradeIds.push(upgradeId);
      licenseIds.push(licenseId);
      return { alreadyPaid: false, status: "paid", licenseIds, upgradeIds };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const digitalItems = items.filter(item => String(item?.productType || "physical") !== "physical");
    for (const item of digitalItems) {
      const productId = String(item?.productId || "").trim();
      if (!productId) continue;

      const licenseId = "order-" + orderId + "-" + productId;
      const downloadId = "order-" + orderId + "-" + productId;

      tx.set(db.collection("licenses").doc(licenseId), {
        uid: order.uid,
        orderId,
        productId,
        productName: String(item.title || "Product").slice(0, 240),
        ownedVersion: String(item.version || "1.0.0").slice(0, 80),
        licenseType: String(item.licenseType || "Standard").slice(0, 100),
        latestVersion: String(item.latestVersion || item.version || "1.0.0").slice(0, 80),
        status: "paid",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByServer: true
      }, { merge: true });

      tx.set(db.collection("downloads").doc(downloadId), {
        uid: order.uid,
        orderId,
        productId,
        version: String(item.version || "1.0.0").slice(0, 80),
        downloadUrl: String(item.downloadUrl || "").slice(0, 3000),
        createdAt: FieldValue.serverTimestamp(),
        createdByServer: true
      }, { merge: true });

      licenseIds.push(licenseId);
    }

    await releaseShopOrderSlotReal(tx, order.uid);
    tx.update(orderRef, {
      status: "paid",
      paymentVerified: true,
      verifiedAt: FieldValue.serverTimestamp(),
      verifiedBy: request.auth.uid,
      verificationNote,
      paymentReference: paymentReference || order.paymentReference || "",
      updatedAt: FieldValue.serverTimestamp()
    });

    return { alreadyPaid: false, status: "paid", licenseIds, upgradeIds };
  });

  return { success: true, ...result };
});

exports.migrateShopDownloadSecretsReal = onCall(async request => {
  requireAdminUser(request);

  const snap = await db.collection("products").limit(100).get();
  let migrated = 0;
  let removed = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const legacyUrl = String(data.downloadUrl || "").trim();

    if (legacyUrl) {
      await db.collection("productSecrets").doc(docSnap.id).set({
        sourceUrl: legacyUrl,
        migratedFrom: "products.downloadUrl",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
      }, { merge: true });

      await docSnap.ref.update({
        downloadUrl: FieldValue.delete()
      });

      migrated++;
      removed++;
    }

    const versions = await db.collection("productVersions")
      .where("productId", "==", docSnap.id)
      .limit(100)
      .get();

    for (const versionSnap of versions.docs) {
      const versionData = versionSnap.data() || {};
      const versionUrl = String(versionData.downloadUrl || "").trim();
      if (!versionUrl) continue;

      await db.collection("productSecrets").doc(docSnap.id).set({
        ["sourceUrlByVersion." + String(versionData.version || versionSnap.id).replace(/[^a-zA-Z0-9._-]/g, "_")]: versionUrl,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
      }, { merge: true });

      await versionSnap.ref.update({
        downloadUrl: FieldValue.delete()
      });
      removed++;
    }
  }

  return { success: true, migrated, removed };
});

exports.getAuthorizedDownloadReal = onCall(async request => {
  requireRealUser(request);

  const licenseId = String(request.data?.licenseId || "").trim();
  if (!licenseId) throw new HttpsError("invalid-argument", "License ID is required.");

  const licenseSnap = await db.collection("licenses").doc(licenseId).get();
  if (!licenseSnap.exists) throw new HttpsError("not-found", "License not found.");

  const license = licenseSnap.data() || {};
  if (license.uid !== request.auth.uid || license.status !== "paid") {
    throw new HttpsError("permission-denied", "A paid license is required.");
  }

  const productId = String(license.productId || "").trim();
  if (!productId) throw new HttpsError("failed-precondition", "License is missing its product.");

  const secretSnap = await db.collection("productSecrets").doc(productId).get();
  if (!secretSnap.exists) throw new HttpsError("not-found", "Protected download is not configured.");

  const secret = secretSnap.data() || {};
  const downloadPath = String(secret.downloadPath || "").trim();
  const sourceUrl = String(secret.sourceUrl || "").trim();

  if (downloadPath) {
    if (!downloadPath.startsWith("shop-downloads/") || downloadPath.includes("..")) {
      throw new HttpsError("failed-precondition", "Invalid protected download path.");
    }
    const file = getStorage().bucket().file(downloadPath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("not-found", "Protected download file not found.");

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000
    });

    return { success: true, url, expiresInSeconds: 600 };
  }

  if (sourceUrl) {
    return { success: true, url: sourceUrl, protected: true };
  }

  throw new HttpsError("failed-precondition", "No protected download is configured.");
});

exports.sendPrivateMessageReal = onCall(async request => {
  requireRealUser(request);

  const textReal = String((request.data && (request.data.text || request.data.textReal)) || "").trim();
  const receiverId = String((request.data && request.data.receiverId) || "");

  if (!textReal || textReal.length > 500 || !receiverId || receiverId === request.auth.uid) {
    throw new HttpsError("invalid-argument", "Invalid private message.");
  }

  const moderation = moderateServerReal(textReal);
  if (!moderation.allowed) {
    await writeModerationLogReal({
      typeReal: "private_callable_blocked",
      originalTextReal: textReal,
      reasonReal: moderation.reason,
      fromUid: request.auth.uid,
      toUid: receiverId
    });
    await recordStrikeReal(request.auth.uid, moderation.reason, "private", "");
    throw new HttpsError("invalid-argument", "Offensive language is not allowed.");
  }

  await enforceRateLimitReal(request.auth.uid);

  const name = displayNameFromRequest(request);
  const token = request.auth.token || {};
  const ref = await db.collection("messages").add({
    uid: request.auth.uid,
    senderId: request.auth.uid,
    receiverId,
    participants: [request.auth.uid, receiverId],
    displayName: name,
    senderPhotoURL: token.picture || "",
    text: moderation.cleanText,
    textReal: moderation.cleanText,
    type: "text",
    createdAt: FieldValue.serverTimestamp(),
    moderatedReal: !!moderation.flagged,
    flaggedReal: !!moderation.flagged,
    verifiedReal: true,
    moderatedBy: "server"
  });

  return {
    success: true,
    id: ref.id,
    moderated: !!moderation.flagged,
    cleanText: moderation.cleanText
  };
});



async function recordCleanupStatsReal(data) {
  const ref = db.collection("systemStats").doc("storageCleanup");
  const deleted = Number(data.deleted || 0);
  const deletedByAge = Number(data.deletedByAge || 0);
  const deletedByCount = Number(data.deletedByCount || 0);
  await ref.set({
    isReal: true,
    deletedByAge: FieldValue.increment(deletedByAge),
    deletedByCount: FieldValue.increment(deletedByCount),
    totalDeleted: FieldValue.increment(deleted),
    lastRunAt: FieldValue.serverTimestamp(),
    lastRunDeleted: deleted,
    lastRunExpired: deletedByAge,
    lastRunCountCap: deletedByCount,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

exports.cleanupGlobalChatMediaReal = onCall(async request => {
  requireRealUser(request);

  const uid = request.auth.uid;
  const prefix = "global-chat/" + uid + "/";
  const maxFiles = 40;
  const bucket = getStorage().bucket();
  const [files] = await bucket.getFiles({ prefix });

  const entries = [];
  for (const file of files) {
    try {
      const [metadata] = await file.getMetadata();
      entries.push({
        file,
        name: file.name,
        time: Date.parse(metadata.timeCreated || "") || 0
      });
    } catch (error) {
      logger.warn("Could not inspect Global Chat media before upload.", {
        name: file.name,
        error: error?.message || String(error)
      });
    }
  }

  if (entries.length < maxFiles) {
    await recordCleanupStatsReal({deleted: 0, deletedByAge: 0, deletedByCount: 0});

    return { success: true, deleted: 0, beforeCount: entries.length, afterCount: entries.length, expiredDocsUpdated: 0 };
  }

  entries.sort((a, b) => a.time - b.time);
  const oldest = entries.slice(0, 15);
  let deleted = 0;
  let expiredDocsUpdated = 0;

  for (const item of oldest) {
    try {
      await item.file.delete();
      deleted++;
      expiredDocsUpdated += await markChatMediaExpiredReal(
        item.name.split("/").pop() || "",
        item.name
      );
    } catch (error) {
      logger.warn("Could not delete old Global Chat media before upload.", {
        name: item.name,
        error: error?.message || String(error)
      });
    }
  }

  return {
    success: true,
    deleted,
    beforeCount: entries.length,
    afterCount: Math.max(0, entries.length - deleted),
    expiredDocsUpdated
  };
});

exports.cleanupOldImagesReal = onSchedule("every 24 hours", async () => {
  const bucket = getStorage().bucket();
  const prefix = "global-chat/";
  const maxFiles = 40;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const [files] = await bucket.getFiles({ prefix });
  const entries = [];

  for (const file of files) {
    try {
      const [metadata] = await file.getMetadata();
      entries.push({
        file,
        name: file.name,
        time: Date.parse(metadata.timeCreated || "") || 0
      });
    } catch (error) {
      logger.warn("Could not read Global Chat media metadata.", {
        name: file.name,
        error: error?.message || String(error)
      });
    }
  }

  const expired = entries.filter(item =>
    item.time > 0 && now - item.time > sevenDaysMs
  );

  const expiredNames = new Set();
  let deletedByAge = 0;
  let expiredDocsUpdated = 0;

  for (const item of expired) {
    try {
      await item.file.delete();
      deletedByAge++;
      expiredNames.add(item.name);
      expiredDocsUpdated += await markChatMediaExpiredReal(
        item.name.split("/").pop() || "",
        item.name
      );
    } catch (error) {
      logger.warn("Could not delete expired Global Chat media.", {
        name: item.name,
        error: error?.message || String(error)
      });
    }
  }

  const remaining = entries
    .filter(item => !expiredNames.has(item.name))
    .sort((a, b) => a.time - b.time);

  const excess = Math.max(0, remaining.length - maxFiles);
  let deletedByCount = 0;

  for (let i = 0; i < excess; i++) {
    const item = remaining[i];
    try {
      await item.file.delete();
      deletedByCount++;
      expiredDocsUpdated += await markChatMediaExpiredReal(
        item.name.split("/").pop() || "",
        item.name
      );
    } catch (error) {
      logger.warn("Could not delete excess Global Chat media.", {
        name: item.name,
        error: error?.message || String(error)
      });
    }
  }

  await recordCleanupStatsReal({
    deleted: deletedByAge + deletedByCount,
    deletedByAge,
    deletedByCount
  });

  logger.info("TUBAL HUB Global Chat media cleanup complete.", {
    scanned: files.length,
    deletedByAge,
    deletedByCount,
    expiredDocsUpdated,
    remainingEstimated: Math.max(0, remaining.length - deletedByCount)
  });

  return null;
});


// Admin analytics: real Firestore activity only. No client-supplied counters.
exports.getAdminAnalyticsReal = onCall(async request => {
  requireAdminUser(request);

  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const usersSnap = await db.collection("users").get();
  const userMap = new Map();
  const cohorts = [];
  for (const snap of usersSnap.docs) {
    const data = snap.data() || {};
    const createdValue = data.createdAt || data.registeredAt || data.created_at;
    const created = createdValue?.toDate ? createdValue.toDate() : new Date(createdValue || 0);
    if (!Number.isNaN(created.getTime())) {
      userMap.set(snap.id, {
        uid: snap.id,
        name: String(data.displayName || data.email || snap.id).slice(0, 120),
        created
      });
      if (created >= start && created <= end) cohorts.push({uid: snap.id, created});
    }
  }

  const messageCollections = ["globalChats", "messages"];
  const allMessages = [];
  for (const collectionName of messageCollections) {
    let cursor = null;
    while (true) {
      let q = db.collection(collectionName)
        .where("createdAt", ">=", Timestamp.fromDate(start))
        .where("createdAt", "<=", Timestamp.fromDate(end))
        .orderBy("createdAt", "asc")
        .limit(10000);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const uid = String(data.uid || data.senderId || data.fromUid || "").trim();
        const createdValue = data.createdAt;
        const created = createdValue?.toDate ? createdValue.toDate() : new Date(createdValue || 0);
        if (!uid || Number.isNaN(created.getTime())) continue;
        allMessages.push({uid, created, collection: collectionName});
      }
      if (snap.size < 10000) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  const dayKey = date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };
  const dayMap = new Map();
  const activeByDay = new Map();
  const hourly = Array.from({length: 24}, () => 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    dayMap.set(key, {date: key, newUsers: 0, messages: 0, activeUsers: 0});
    activeByDay.set(key, new Set());
  }

  for (const user of userMap.values()) {
    if (user.created >= start && user.created <= end) {
      const key = dayKey(user.created);
      if (dayMap.has(key)) dayMap.get(key).newUsers++;
    }
  }

  const activeTotals = new Map();
  for (const msg of allMessages) {
    const key = dayKey(msg.created);
    if (!dayMap.has(key)) continue;
    dayMap.get(key).messages++;
    activeByDay.get(key).add(msg.uid);
    activeTotals.set(msg.uid, (activeTotals.get(msg.uid) || 0) + 1);
    hourly[msg.created.getHours()]++;
  }
  for (const [key, set] of activeByDay) dayMap.get(key).activeUsers = set.size;

  const sortedDays = Array.from(dayMap.values());
  const todayKey = dayKey(now);
  const todayActive = activeByDay.get(todayKey) || new Set();
  const weekKeys = sortedDays.slice(-7).map(x => x.date);
  const weekActive = new Set();
  for (const key of weekKeys) for (const uid of (activeByDay.get(key) || [])) weekActive.add(uid);

  const mostActiveUsers = Array.from(activeTotals.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => ({
      uid,
      name: userMap.get(uid)?.name || uid,
      messages: count
    }));

  const retention = {d1: null, d7: null, d30: null};
  for (const n of [1, 7, 30]) {
    const eligible = cohorts.filter(c => {
      const target = new Date(c.created);
      target.setHours(0,0,0,0);
      target.setDate(target.getDate() + n);
      return target <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
    if (!eligible.length) continue;
    let retained = 0;
    for (const cohort of eligible) {
      const target = new Date(cohort.created);
      target.setHours(0,0,0,0);
      target.setDate(target.getDate() + n);
      const key = dayKey(target);
      if ((activeByDay.get(key) || new Set()).has(cohort.uid)) retained++;
    }
    retention["d" + n] = {
      eligible: eligible.length,
      retained,
      rate: Number(((retained / eligible.length) * 100).toFixed(1))
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: "Firestore users + globalChats + messages; retention is message-based",
    dau: todayActive.size,
    wau: weekActive.size,
    totalMessages30d: allMessages.length,
    totalNewUsers30d: cohorts.length,
    days: sortedDays,
    hourly,
    mostActiveUsers,
    retention
  };
});

logger.info("TUBAL HUB server moderation functions loaded.");
