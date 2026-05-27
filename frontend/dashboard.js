// ═══════════════════════════════════════
//  MiTV Live Stream Panel — dashboard.js
// ═══════════════════════════════════════

// ── Firebase Config ──
const firebaseConfig = {
  apiKey: "AIzaSyBbnU8DkthpYQMHOLLyj6M0cc05qXfjMcw",
  authDomain: "ramadan-2385b.firebaseapp.com",
  databaseURL: "https://ramadan-2385b-default-rtdb.firebaseio.com",
  projectId: "ramadan-2385b",
  storageBucket: "ramadan-2385b.firebasestorage.app",
  messagingSenderId: "882828936310",
  appId: "1:882828936310:web:7f97b921031fe130fe4b57"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const IMGBB_KEY = "6bdb23b28e7581721b28e46ce313308b";
const DB = {
  sources:   db.ref("stream/sources"),
  schedule:  db.ref("stream/schedule"),
  overlays:  db.ref("stream/overlays"),
  status:    db.ref("stream/status"),
  logs:      db.ref("stream/logs"),
  output:    db.ref("stream/output"),
  audio:     db.ref("stream/audio"),
};

let hlsPlayer = null;
let clockInterval = null;
let backendUrl = localStorage.getItem("backendUrl") || "";
if (backendUrl) document.getElementById("backendUrl").value = backendUrl;

// ════════════ TABS ════════════
function switchTab(id, el) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + id).classList.add("active");
  el.classList.add("active");
  if (id === "preview") initPreviewOverlays();
  if (id === "logs") loadLogs();
}

// ════════════ STREAM CONTROL ════════════
async function startStream() {
  if (!backendUrl) return alert("Backend URL not set! Go to Output tab and set it.");
  addLog("Sending START command to backend...", "info");
  try {
    const res = await fetch(backendUrl + "/stream/start", { method:"POST" });
    const data = await res.json();
    addLog("Stream started: " + (data.message || "OK"), "ok");
    DB.status.set({ online: true, started: Date.now() });
  } catch(e) { addLog("START failed: " + e.message, "err"); }
}

async function stopStream() {
  if (!backendUrl) return alert("Backend URL not set.");
  addLog("Sending STOP command...", "warn");
  try {
    const res = await fetch(backendUrl + "/stream/stop", { method:"POST" });
    const data = await res.json();
    addLog("Stream stopped: " + (data.message || "OK"), "warn");
    DB.status.set({ online: false, stopped: Date.now() });
  } catch(e) { addLog("STOP failed: " + e.message, "err"); }
}

async function restartStream() {
  if (!backendUrl) return alert("Backend URL not set.");
  addLog("Restarting stream...", "warn");
  try {
    const res = await fetch(backendUrl + "/stream/restart", { method:"POST" });
    const data = await res.json();
    addLog("Restarted: " + (data.message || "OK"), "ok");
  } catch(e) { addLog("RESTART failed: " + e.message, "err"); }
}

// ════════════ STATUS LISTENER ════════════
DB.status.on("value", snap => {
  const s = snap.val() || {};
  const dot = document.getElementById("statusDot");
  const txt = document.getElementById("statusText");
  if (s.online) {
    dot.className = "dot online";
    txt.textContent = "LIVE";
    txt.style.color = "#06d6a0";
  } else {
    dot.className = "dot offline";
    txt.textContent = "OFFLINE";
    txt.style.color = "#6a7a8a";
  }
});

// ════════════ SOURCES ════════════
function getSourceType(url) {
  if (!url) return "m3u8";
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "yt";
  if (u.includes(".mp4")) return "mp4";
  if (u.includes(".mp3")) return "mp3";
  return "m3u8";
}

function addSource() {
  const url = document.getElementById("sourceUrl").value.trim();
  const label = document.getElementById("sourceLabel").value.trim() || "Source";
  if (!url) return alert("Enter a URL first.");
  const type = getSourceType(url);
  const key = db.ref("stream/sources").push().key;
  DB.sources.child(key).set({ url, label, type, active: true, added: Date.now() });
  document.getElementById("sourceUrl").value = "";
  document.getElementById("sourceLabel").value = "";
  addLog(`Added source: [${type.toUpperCase()}] ${label}`, "ok");
}

DB.sources.on("value", snap => {
  const list = document.getElementById("sourceList");
  list.innerHTML = "";
  const items = snap.val() || {};
  Object.entries(items).forEach(([key, s]) => {
    const div = document.createElement("div");
    div.className = "source-item";
    div.innerHTML = `
      <span class="src-label">${s.label}</span>
      <span class="src-url">${s.url}</span>
      <span class="src-badge badge-${s.type}">${s.type.toUpperCase()}</span>
      <button class="del-btn" onclick="deleteSource('${key}')">✕</button>
    `;
    list.appendChild(div);
  });
});

function deleteSource(key) {
  if (confirm("Remove this source?")) DB.sources.child(key).remove();
}

// ════════════ AUDIO ════════════
function updateAudio() {
  const vol = document.getElementById("audioVolume").value;
  document.getElementById("volumeVal").textContent = parseFloat(vol).toFixed(1);
  const mute = document.getElementById("muteOriginal").checked;
  const bgm = document.getElementById("bgMusic").value.trim();
  DB.audio.set({ volume: parseFloat(vol), muteOriginal: mute, bgMusic: bgm });
  addLog(`Audio: vol=${vol}, mute=${mute}`, "info");
}

function setBgMusic() { updateAudio(); addLog("Background music updated.", "ok"); }

// ════════════ OVERLAYS ════════════
function updateOverlay() {
  const data = getOverlayData();
  DB.overlays.set(data);
  applyPreviewOverlays(data);
}

function getOverlayData() {
  return {
    logo: {
      url: document.getElementById("logoUrl").value.trim(),
      x: parseInt(document.getElementById("logoX").value),
      y: parseInt(document.getElementById("logoY").value),
      scale: parseInt(document.getElementById("logoScale").value),
      anim: document.getElementById("logoAnim").value,
      borderColor: document.getElementById("logoBorderColor").value,
      borderWidth: parseInt(document.getElementById("logoBorderWidth").value),
      shadow: document.getElementById("logoShadow").checked,
    },
    channel: {
      text: document.getElementById("channelText").value,
      font: document.getElementById("channelFont").value,
      size: parseInt(document.getElementById("channelFontSize").value),
      color: document.getElementById("channelColor").value,
      x: parseInt(document.getElementById("channelX").value),
      y: parseInt(document.getElementById("channelY").value),
    },
    ticker: {
      text: document.getElementById("tickerText").value,
      show: document.getElementById("showTicker").checked,
      bg: document.getElementById("tickerBg").value,
      color: document.getElementById("tickerColor").value,
      speed: document.getElementById("tickerSpeed").value,
    },
    clock: {
      show: document.getElementById("showClock").checked,
      showDate: document.getElementById("showDate").checked,
      format: document.getElementById("clockFormat").value,
      color: document.getElementById("clockColor").value,
      anim: document.getElementById("clockAnim").value,
    },
    patti: {
      show: document.getElementById("showPatti").checked,
      color: document.getElementById("pattiColor").value,
      position: document.getElementById("pattiPosition").value,
      height: parseInt(document.getElementById("pattiHeight").value),
    }
  };
}

function setLogoUrl() {
  const url = document.getElementById("logoUrl").value.trim();
  if (url) {
    const img = document.getElementById("logoPreview");
    img.src = url; img.style.display = "block";
    updateOverlay();
  }
}

// ImgBB Upload
async function uploadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  addLog("Uploading logo to ImgBB...", "info");
  const form = new FormData();
  form.append("image", file);
  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method:"POST", body:form });
    const data = await res.json();
    if (data.success) {
      const url = data.data.url;
      document.getElementById("logoUrl").value = url;
      const img = document.getElementById("logoPreview");
      img.src = url; img.style.display = "block";
      updateOverlay();
      addLog("Logo uploaded: " + url, "ok");
    } else {
      addLog("ImgBB upload failed: " + JSON.stringify(data.error), "err");
    }
  } catch(e) { addLog("Upload error: " + e.message, "err"); }
}

// Listen to overlays from Firebase and sync back to form
DB.overlays.on("value", snap => {
  const d = snap.val();
  if (!d) return;
  // Populate form if values differ (for multi-device sync)
  try {
    if (d.logo) {
      if (d.logo.url) { document.getElementById("logoUrl").value = d.logo.url; document.getElementById("logoPreview").src = d.logo.url; document.getElementById("logoPreview").style.display="block"; }
      document.getElementById("logoX").value = d.logo.x || 2; document.getElementById("logoXVal").textContent = d.logo.x || 2;
      document.getElementById("logoY").value = d.logo.y || 2; document.getElementById("logoYVal").textContent = d.logo.y || 2;
      document.getElementById("logoScale").value = d.logo.scale || 15; document.getElementById("logoScaleVal").textContent = d.logo.scale || 15;
      document.getElementById("logoAnim").value = d.logo.anim || "none";
    }
    if (d.channel) {
      document.getElementById("channelText").value = d.channel.text || "";
      document.getElementById("channelFont").value = d.channel.font || "Orbitron";
      document.getElementById("channelFontSize").value = d.channel.size || 28;
      document.getElementById("channelColor").value = d.channel.color || "#ffffff";
    }
    if (d.ticker) {
      document.getElementById("tickerText").value = d.ticker.text || "";
      document.getElementById("showTicker").checked = d.ticker.show !== false;
      document.getElementById("tickerBg").value = d.ticker.bg || "#cc0000";
      document.getElementById("tickerColor").value = d.ticker.color || "#ffffff";
    }
    if (d.clock) {
      document.getElementById("showClock").checked = d.clock.show !== false;
      document.getElementById("showDate").checked = d.clock.showDate !== false;
      document.getElementById("clockColor").value = d.clock.color || "#ffff00";
    }
  } catch(e) {}
  applyPreviewOverlays(d);
});

// ════════════ PREVIEW OVERLAYS ════════════
function applyPreviewOverlays(d) {
  if (!d) return;
  const sw = document.getElementById("previewScreen");
  if (!sw || !sw.offsetWidth) return;

  // LOGO
  const ovLogo = document.getElementById("ovLogo");
  if (d.logo && d.logo.url) {
    const xPx = (d.logo.x / 100) * sw.offsetWidth;
    const yPx = (d.logo.y / 100) * sw.offsetHeight;
    const scalePx = Math.round((d.logo.scale / 100) * sw.offsetWidth);
    let logoHtml = `<img src="${d.logo.url}" style="width:${scalePx}px;`;
    if (d.logo.borderWidth > 0) logoHtml += `border:${d.logo.borderWidth}px solid ${d.logo.borderColor};`;
    if (d.logo.shadow) logoHtml += `box-shadow:0 0 12px rgba(0,0,0,0.8);`;
    logoHtml += `border-radius:4px;" />`;
    ovLogo.innerHTML = logoHtml;
    ovLogo.style.left = xPx + "px";
    ovLogo.style.top = yPx + "px";
    ovLogo.className = "ov-logo";
    if (d.logo.anim && d.logo.anim !== "none") {
      ovLogo.classList.add("anim-" + d.logo.anim);
    }
  } else { ovLogo.innerHTML = ""; }

  // CHANNEL TEXT
  const ovCh = document.getElementById("ovChannel");
  if (d.channel && d.channel.text) {
    const xPx = (d.channel.x / 100) * sw.offsetWidth;
    const yPx = (d.channel.y / 100) * sw.offsetHeight;
    ovCh.textContent = d.channel.text;
    ovCh.style.cssText = `left:${xPx}px;top:${yPx}px;font-family:'${d.channel.font}',monospace;font-size:${d.channel.size}px;color:${d.channel.color};`;
  } else { ovCh.textContent = ""; }

  // TICKER
  const ovTicker = document.getElementById("ovTicker");
  const tickerScroll = document.getElementById("tickerScroll");
  if (d.ticker) {
    ovTicker.style.display = d.ticker.show ? "flex" : "none";
    ovTicker.style.background = (d.ticker.bg || "#cc0000") + "cc";
    tickerScroll.style.color = d.ticker.color || "#fff";
    tickerScroll.textContent = d.ticker.text || "Breaking News Ticker...";
    const speeds = { slow: "35s", normal: "20s", fast: "10s" };
    tickerScroll.style.animationDuration = speeds[d.ticker.speed] || "20s";
  }

  // CLOCK
  const ovClock = document.getElementById("ovClock");
  if (d.clock && d.clock.show) {
    ovClock.style.cssText = `right:10px;top:10px;font-size:16px;color:${d.clock.color || "#ffff00"};`;
  } else { ovClock.style.display = "none"; return; }
  ovClock.style.display = "block";

  // PATTI
  const ovPatti = document.getElementById("ovPatti");
  if (d.patti && d.patti.show) {
    const h = (d.patti.height || 8) + "%";
    ovPatti.style.cssText = `${d.patti.position === "top" ? "top" : "bottom"}:0;height:${h};background:${d.patti.color || "#003366"}cc;`;
    ovPatti.style.display = "block";
  } else { ovPatti.style.display = "none"; }
}

function initPreviewOverlays() {
  DB.overlays.once("value", snap => {
    applyPreviewOverlays(snap.val());
  });
  startClock();
}

// Live clock in preview
function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(() => {
    const ovClock = document.getElementById("ovClock");
    if (!ovClock || ovClock.style.display === "none") return;
    const now = new Date();
    const fmt = document.getElementById("clockFormat")?.value || "12h";
    let time = "";
    if (fmt === "12h") {
      let h = now.getHours() % 12 || 12;
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      const ap = now.getHours() >= 12 ? "PM" : "AM";
      time = `${h}:${m}:${s} ${ap}`;
    } else {
      time = now.toTimeString().slice(0, 8);
    }
    const showDate = document.getElementById("showDate")?.checked;
    const date = now.toLocaleDateString("en-PK", { day:"2-digit", month:"short", year:"numeric" });
    ovClock.innerHTML = `<div>${time}</div>${showDate ? `<div style="font-size:11px;opacity:0.8">${date}</div>` : ""}`;
  }, 1000);
}

// ════════════ HLS PREVIEW ════════════
function loadPreview() {
  const url = document.getElementById("previewM3u8").value.trim();
  if (!url) return alert("Enter an M3U8 URL.");
  playHls(url);
}

function loadFromFirebase() {
  DB.output.child("m3u8Url").once("value", snap => {
    const url = snap.val();
    if (!url) return addLog("No output URL found in Firebase.", "warn");
    document.getElementById("previewM3u8").value = url;
    playHls(url);
  });
}

function playHls(url) {
  const video = document.getElementById("previewVideo");
  if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
  if (Hls.isSupported()) {
    hlsPlayer = new Hls();
    hlsPlayer.loadSource(url);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play();
      const lvl = hlsPlayer.levels[hlsPlayer.currentLevel] || {};
      document.getElementById("prevRes").textContent = lvl.width ? `${lvl.width}x${lvl.height}` : "HLS";
    });
    hlsPlayer.on(Hls.Events.ERROR, (e, d) => {
      if (d.fatal) addLog("HLS error: " + d.details, "err");
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    video.play();
  } else { addLog("HLS not supported in this browser.", "err"); }
}

// ════════════ SCHEDULE ════════════
function addSchedule() {
  const time = document.getElementById("schedTime").value;
  const url = document.getElementById("schedUrl").value.trim();
  const label = document.getElementById("schedLabel").value.trim() || "Scheduled";
  if (!time || !url) return alert("Set time and URL.");
  const key = DB.schedule.push().key;
  DB.schedule.child(key).set({ time, url, label, enabled: true, added: Date.now() });
  addLog(`Scheduled: ${label} at ${time}`, "ok");
  document.getElementById("schedUrl").value = "";
  document.getElementById("schedLabel").value = "";
}

DB.schedule.on("value", snap => {
  const list = document.getElementById("schedList");
  list.innerHTML = "";
  const items = snap.val() || {};
  const sorted = Object.entries(items).sort((a, b) => a[1].time.localeCompare(b[1].time));
  sorted.forEach(([key, s]) => {
    const div = document.createElement("div");
    div.className = "sched-item";
    div.innerHTML = `
      <span style="color:var(--yellow);font-family:var(--font-head);font-size:13px;min-width:70px">${s.time}</span>
      <span style="color:var(--accent2);min-width:100px">${s.label}</span>
      <span style="color:var(--dim);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.url}</span>
      <button class="del-btn" onclick="deleteSchedule('${key}')">✕</button>
    `;
    list.appendChild(div);
  });
});

function deleteSchedule(key) {
  if (confirm("Remove?")) DB.schedule.child(key).remove();
}

// ════════════ LOGS ════════════
function addLog(msg, type = "info") {
  const now = new Date().toLocaleTimeString("en-PK");
  const entry = { msg, type, ts: now, at: Date.now() };
  DB.logs.push(entry);
  renderLog(entry);
}

function renderLog(entry) {
  const box = document.getElementById("logBox");
  if (!box) return;
  const span = document.createElement("span");
  span.className = `log-line log-${entry.type}`;
  span.innerHTML = `<span class="log-time">[${entry.ts}]</span>${entry.msg}`;
  box.appendChild(span);
  box.scrollTop = box.scrollHeight;
}

function loadLogs() {
  const box = document.getElementById("logBox");
  box.innerHTML = "";
  DB.logs.limitToLast(80).once("value", snap => {
    const logs = snap.val() || {};
    Object.values(logs).sort((a, b) => a.at - b.at).forEach(renderLog);
  });
}

function clearLogs() { if (confirm("Clear all logs?")) { DB.logs.remove(); document.getElementById("logBox").innerHTML = ""; } }

// Auto-load logs on startup
DB.logs.limitToLast(1).on("child_added", snap => {
  const box = document.getElementById("logBox");
  if (box) renderLog(snap.val());
});

// ════════════ OUTPUT ════════════
DB.output.on("value", snap => {
  const d = snap.val() || {};
  if (d.m3u8Url) {
    document.getElementById("outM3u8").value = d.m3u8Url;
    document.getElementById("outEmbed").value =
      `<video controls autoplay>\n  <source src="${d.m3u8Url}" type="application/x-mpegURL">\n</video>`;
  }
});

function saveBackendUrl() {
  const url = document.getElementById("backendUrl").value.trim().replace(/\/$/, "");
  if (!url) return;
  backendUrl = url;
  localStorage.setItem("backendUrl", url);
  db.ref("stream/config/backendUrl").set(url);
  addLog("Backend URL saved: " + url, "ok");
  alert("Backend URL saved!");
}

function copyText(id) {
  const el = document.getElementById(id);
  el.select();
  document.execCommand("copy");
  addLog("Copied to clipboard.", "ok");
}

// ════════════ SLIDER DISPLAYS ════════════
["logoX","logoY","logoScale"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => {
    const display = document.getElementById(id + "Val");
    if (display) display.textContent = el.value;
  });
});

// ════════════ INIT ════════════
addLog("MiTV Control Room loaded.", "ok");
startClock();
