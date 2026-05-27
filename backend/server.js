// ═══════════════════════════════════════
//  MiTV Live Stream Backend — server.js
//  Node.js + Express + FFmpeg + Firebase
// ═══════════════════════════════════════
require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const path        = require("path");
const fs          = require("fs");
const admin       = require("firebase-admin");
const StreamMgr   = require("./streamController");
const { buildFFmpegArgs } = require("./ffmpegBuilder");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Firebase Admin init ──
const serviceAccount = {
  type: "service_account",
  project_id: "ramadan-2385b",
  private_key_id: process.env.FB_PRIVATE_KEY_ID || "",
  private_key: (process.env.FB_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email: process.env.FB_CLIENT_EMAIL || "",
  client_id: process.env.FB_CLIENT_ID || "",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

let firebaseDb;
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://ramadan-2385b-default-rtdb.firebaseio.com",
  });
  firebaseDb = admin.database();
  console.log("[Firebase] Admin SDK connected.");
} catch (e) {
  console.error("[Firebase] Admin SDK failed — using public client SDK fallback.");
  // Fallback: no admin SDK — stream manager will still work from stored config
}

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Serve HLS segments
const HLS_DIR = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });
app.use("/live", express.static(HLS_DIR));

// ── Stream Manager ──
const streamMgr = new StreamMgr(HLS_DIR, firebaseDb);

// ── Routes ──
app.get("/health", (req, res) => {
  res.json({ status: "ok", streaming: streamMgr.isRunning(), ts: Date.now() });
});

app.post("/stream/start", async (req, res) => {
  try {
    let config = req.body || {};
    // Load from Firebase if no body
    if (firebaseDb && !config.sources) {
      const snap = await firebaseDb.ref("stream").once("value");
      config = snap.val() || {};
    }
    await streamMgr.start(config);
    const m3u8Url = `${req.protocol}://${req.get("host")}/live/stream.m3u8`;
    if (firebaseDb) {
      await firebaseDb.ref("stream/output").set({ m3u8Url, started: Date.now() });
      await firebaseDb.ref("stream/status").set({ online: true, started: Date.now() });
    }
    res.json({ ok: true, message: "Stream started", m3u8Url });
  } catch (e) {
    console.error("[START]", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/stream/stop", async (req, res) => {
  streamMgr.stop();
  if (firebaseDb) await firebaseDb.ref("stream/status").set({ online: false, stopped: Date.now() });
  res.json({ ok: true, message: "Stream stopped" });
});

app.post("/stream/restart", async (req, res) => {
  try {
    streamMgr.stop();
    await new Promise(r => setTimeout(r, 1500));
    let config = {};
    if (firebaseDb) {
      const snap = await firebaseDb.ref("stream").once("value");
      config = snap.val() || {};
    }
    await streamMgr.start(config);
    res.json({ ok: true, message: "Stream restarted" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/stream/status", (req, res) => {
  res.json({ running: streamMgr.isRunning(), pid: streamMgr.pid() });
});

app.get("/stream/m3u8", (req, res) => {
  const url = `${req.protocol}://${req.get("host")}/live/stream.m3u8`;
  res.json({ url });
});

// ── Firebase Realtime Listener (auto-apply overlay changes) ──
if (firebaseDb) {
  let debounce = null;
  firebaseDb.ref("stream/overlays").on("value", async snap => {
    if (!streamMgr.isRunning()) return;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      console.log("[Firebase] Overlay change detected — restarting stream...");
      try {
        const fullSnap = await firebaseDb.ref("stream").once("value");
        const config = fullSnap.val() || {};
        streamMgr.stop();
        await new Promise(r => setTimeout(r, 2000));
        await streamMgr.start(config);
        log("Overlays updated — stream restarted", "ok");
      } catch (e) { console.error("[Overlay-reload]", e.message); }
    }, 3000); // 3s debounce
  });
}

// ── Keepalive self-ping ──
setInterval(() => {
  if (!streamMgr.isRunning()) {
    console.log("[Keepalive] Stream not running — auto-restart...");
    if (firebaseDb) {
      firebaseDb.ref("stream").once("value").then(snap => {
        const cfg = snap.val() || {};
        if (cfg.sources && Object.keys(cfg.sources).length) streamMgr.start(cfg).catch(console.error);
      });
    }
  }
}, 5 * 60 * 1000); // every 5 min

async function log(msg, type = "info") {
  const ts = new Date().toLocaleTimeString("en-PK");
  if (firebaseDb) firebaseDb.ref("stream/logs").push({ msg, type, ts, at: Date.now() });
}

app.listen(PORT, () => {
  console.log(`[MiTV] Backend running on port ${PORT}`);
  console.log(`[MiTV] HLS directory: ${HLS_DIR}`);
});
