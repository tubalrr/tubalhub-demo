import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import Replicate from "replicate";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());

app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "16kb" }));

function requireFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
      })
    });
  }
}

function getBearerToken(req) {
  const header = req.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

async function authenticate(req, res, next) {
  try {
    requireFirebaseAdmin();

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Login required." });

    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.uid) return res.status(401).json({ error: "Invalid authentication token." });

    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth verification failed:", error?.message || error);
    return res.status(401).json({ error: "Authentication failed. Please sign in again." });
  }
}

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || req.ip,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many music generations. Please wait and try again later."
    });
  }
});

const downloads = new Map();
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, item] of downloads) {
    if (item.expiresAt <= now) downloads.delete(id);
  }
}, 10 * 60 * 1000).unref();

function buildPrompt({ prompt, mood, vocals }) {
  const vocalRule = vocals === "none"
    ? "instrumental only, no vocals, no singing"
    : "subtle non-lyrical vocal texture only, no lyrics";

  return `${prompt}. Mood: ${mood}. ${vocalRule}. Original composition, suitable as background music.`;
}

function isAllowedReplicateUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "replicate.delivery" ||
       url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "TUBAL HUB AI Music API" });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "TUBAL HUB AI Music API" });
});

app.post("/api/generate", authenticate, generateLimiter, async (req, res) => {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      return res.status(503).json({ error: "AI music provider is not configured." });
    }

    const {
      prompt,
      mood = "Peaceful",
      duration = 10,
      vocals = "none"
    } = req.body || {};

    if (typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({ error: "Please describe the music you want." });
    }

    const seconds = Number(duration);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 30) {
      return res.status(400).json({ error: "Music generation supports 5–30 seconds per track." });
    }

    const allowedMoods = new Set([
      "Peaceful", "Emotional", "Adventure", "Relaxing", "Dreamy"
    ]);

    const safeMood = allowedMoods.has(String(mood)) ? String(mood) : "Peaceful";
    const safeVocals = vocals === "soft" ? "soft" : "none";

    const finalPrompt = buildPrompt({
      prompt: prompt.trim().slice(0, 1000),
      mood: safeMood,
      vocals: safeVocals
    });

    const output = await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      {
        input: {
          prompt: finalPrompt,
          duration: seconds,
          output_format: "mp3",
          normalization_strategy: "peak",
          temperature: 1,
          top_k: 250,
          top_p: 0,
          classifier_free_guidance: 3,
          continuation: false,
          model_version: "stereo-large"
        }
      }
    );

    const audioUrl = typeof output?.url === "function" ? output.url() : String(output);

    if (!isAllowedReplicateUrl(audioUrl)) {
      throw new Error("Unexpected audio output URL.");
    }

    const downloadId = crypto.randomUUID();

    downloads.set(downloadId, {
      uid: req.user.uid,
      url: audioUrl,
      expiresAt: Date.now() + DOWNLOAD_TTL_MS
    });

    return res.json({
      ok: true,
      streamUrl: `/api/download/${downloadId}`,
      downloadUrl: `/api/download/${downloadId}`,
      duration: seconds,
      mood: safeMood
    });
  } catch (error) {
    console.error("Generation error:", error);
    return res.status(500).json({
      error: "Music generation failed. Please try again later."
    });
  }
});

app.get("/api/download/:downloadId", authenticate, async (req, res) => {
  const item = downloads.get(req.params.downloadId);

  if (!item || item.expiresAt <= Date.now()) {
    downloads.delete(req.params.downloadId);
    return res.status(404).send("Audio file expired. Generate the track again.");
  }

  if (item.uid !== req.user.uid) {
    return res.status(403).send("You are not allowed to access this audio file.");
  }

  try {
    const upstream = await fetch(item.url);

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send("Audio file is no longer available. Generate the track again.");
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Content-Disposition", 'attachment; filename="tubal-hub-ai-music.mp3"');
    res.setHeader("Cache-Control", "private, no-store");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const reader = upstream.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    console.error("Download proxy error:", error);
    if (!res.headersSent) res.status(500).send("Download failed. Please generate the track again.");
    else res.end();
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`TUBAL HUB AI Music API running on port ${port}`);
});
