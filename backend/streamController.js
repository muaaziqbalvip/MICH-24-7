// ═══════════════════════════════════════
//  MiTV — streamController.js
//  Manages FFmpeg child process lifecycle
// ═══════════════════════════════════════
const { spawn }  = require("child_process");
const path       = require("path");
const { buildFFmpegArgs } = require("./ffmpegBuilder");

class StreamManager {
  constructor(hlsDir, db) {
    this.hlsDir   = hlsDir;
    this.db       = db;
    this.process  = null;
    this.config   = null;
    this._restartTimer = null;
    this._retries = 0;
    this.MAX_RETRIES = 10;
  }

  isRunning() { return !!(this.process && !this.process.killed); }
  pid()       { return this.process ? this.process.pid : null; }

  async start(config) {
    if (this.isRunning()) this.stop();
    this.config   = config;
    this._retries = 0;
    return this._spawn();
  }

  stop() {
    clearTimeout(this._restartTimer);
    if (this.process) {
      try { this.process.kill("SIGKILL"); } catch(e) {}
      this.process = null;
    }
  }

  async _spawn() {
    const { args, inputSource } = buildFFmpegArgs(this.config, this.hlsDir);
    if (!inputSource) throw new Error("No valid source found in config.");

    console.log(`[FFmpeg] Starting stream from: ${inputSource}`);
    console.log(`[FFmpeg] Args: ffmpeg ${args.join(" ")}`);

    this.process = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    this.process.stderr.on("data", chunk => {
      const line = chunk.toString();
      if (line.includes("frame=") || line.includes("time=")) {
        process.stdout.write("\r[FFmpeg] " + line.split("\n")[0]);
      }
      if (line.includes("Error") || line.includes("error")) {
        console.error("[FFmpeg ERR]", line.trim());
        if (this.db) this.db.ref("stream/logs").push({ msg: "FFmpeg: " + line.trim(), type: "err", ts: new Date().toLocaleTimeString("en-PK"), at: Date.now() });
      }
    });

    this.process.on("exit", (code, signal) => {
      console.log(`\n[FFmpeg] Process exited: code=${code} signal=${signal}`);
      if (this.db) this.db.ref("stream/logs").push({ msg: `FFmpeg exited (code ${code})`, type: code === 0 ? "info" : "warn", ts: new Date().toLocaleTimeString("en-PK"), at: Date.now() });

      // Auto-restart unless manually stopped
      if (this.config && this._retries < this.MAX_RETRIES) {
        this._retries++;
        const delay = Math.min(this._retries * 3000, 30000); // backoff up to 30s
        console.log(`[FFmpeg] Restarting in ${delay / 1000}s (attempt ${this._retries}/${this.MAX_RETRIES})...`);
        this._restartTimer = setTimeout(() => this._spawn().catch(console.error), delay);
      } else if (this._retries >= this.MAX_RETRIES) {
        console.error("[FFmpeg] Max retries reached. Manual restart required.");
        if (this.db) this.db.ref("stream/status").set({ online: false, error: "Max retries reached" });
      }
    });

    this.process.on("error", err => {
      console.error("[FFmpeg] Spawn error:", err.message);
      if (err.code === "ENOENT") throw new Error("FFmpeg not found. Install FFmpeg on the server.");
    });

    if (this.db) {
      this.db.ref("stream/logs").push({ msg: "Stream started", type: "ok", ts: new Date().toLocaleTimeString("en-PK"), at: Date.now() });
    }

    return true;
  }
}

module.exports = StreamManager;
