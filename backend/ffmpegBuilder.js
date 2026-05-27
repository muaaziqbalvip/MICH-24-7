// ═══════════════════════════════════════
//  MiTV — ffmpegBuilder.js
//  Builds FFmpeg command with overlays
// ═══════════════════════════════════════
const path = require("path");

/**
 * Picks the first valid source from Firebase config.
 * Returns { url, type }
 */
function pickSource(config) {
  const sources = config?.sources || {};
  const list = Object.values(sources).filter(s => s.active !== false && s.url);
  if (!list.length) return null;
  // Prefer m3u8 first, then mp4, then others
  const m3u8 = list.find(s => s.type === "m3u8");
  const mp4  = list.find(s => s.type === "mp4");
  return m3u8 || mp4 || list[0];
}

/**
 * Builds and returns { args: [...], inputSource: 'url' }
 * for spawning: ffmpeg ...args
 */
function buildFFmpegArgs(config, hlsDir) {
  const source = pickSource(config);
  if (!source) return { args: [], inputSource: null };

  const ov  = config?.overlays || {};
  const aud = config?.audio    || {};
  const isYT = source.type === "yt" || source.url.includes("youtube");

  const outM3u8 = path.join(hlsDir, "stream.m3u8");
  const outSeg  = path.join(hlsDir, "seg%03d.ts");

  let args = [];

  // ── Re-connect if stream drops ──
  args.push("-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5");

  // ── Input ──
  if (source.type === "m3u8" || source.url.includes("m3u8")) {
    args.push("-allowed_extensions", "ALL");
  }

  // Pipe from yt-dlp for YouTube
  // If YouTube, caller must handle via yt-dlp pipe (advanced — skip in v1, treat as HTTP stream)
  args.push("-i", source.url);

  // Background music input (if set and original muted)
  let hasBgm = false;
  if (aud.bgMusic && aud.muteOriginal) {
    args.push("-stream_loop", "-1", "-i", aud.bgMusic);
    hasBgm = true;
  }

  // Logo image input (if set)
  let hasLogo = false;
  if (ov.logo && ov.logo.url) {
    args.push("-i", ov.logo.url);
    hasLogo = true;
  }

  // ── Filter graph ──
  const filters = [];
  let videoTag  = "0:v";
  let audioTag  = "0:a";

  // Volume / mute
  if (aud.muteOriginal) {
    if (hasBgm) {
      filters.push(`[1:a]volume=${aud.volume || 1.0}[aout]`);
      audioTag = "[aout]";
    } else {
      filters.push(`[0:a]volume=0[aout]`);
      audioTag = "[aout]";
    }
  } else if (aud.volume && aud.volume !== 1.0) {
    filters.push(`[0:a]volume=${aud.volume}[aout]`);
    audioTag = "[aout]";
  }

  // ── Logo overlay ──
  let logoInputIndex = hasBgm ? 2 : 1;
  if (hasLogo) {
    const logo = ov.logo;
    const w  = logo.scale ? `${logo.scale * 8}` : "120"; // scale% → rough px
    const x  = logo.x ? `(W*${logo.x}/100)` : "10";
    const y  = logo.y ? `(H*${logo.y}/100)` : "10";
    const shadowFilter = logo.shadow
      ? `,boxblur=luma_radius=2:luma_power=1`
      : "";

    filters.push(
      `[${logoInputIndex}:v]scale=${w}:-1${shadowFilter}[logo]`,
      `[${videoTag}][logo]overlay=${x}:${y}[ov0]`
    );
    videoTag = "[ov0]";
  }

  // ── Text overlays via drawtext ──
  const drawFilters = [];

  // Channel name / watermark
  if (ov.channel && ov.channel.text) {
    const ch = ov.channel;
    const fontColor = (ch.color || "#ffffff").replace("#", "0x");
    const x = `(W*${ch.x || 50}/100)`;
    const y = `(H*${ch.y || 90}/100)`;
    drawFilters.push(
      `drawtext=text='${escapeText(ch.text)}':fontsize=${ch.size || 28}:fontcolor=${fontColor}:x=${x}:y=${y}:shadowx=2:shadowy=2:shadowcolor=0x000000`
    );
  }

  // Ticker (scrolling text at bottom)
  if (ov.ticker && ov.ticker.show && ov.ticker.text) {
    const t = ov.ticker;
    const fgColor  = (t.color || "#ffffff").replace("#","0x");
    const bgColor  = (t.bg || "#cc0000").replace("#","0x") + "cc";
    const speeds   = { slow: "60", normal: "100", fast: "180" };
    const speed    = speeds[t.speed] || "100";
    drawFilters.push(
      `drawtext=text='  BREAKING: ${escapeText(t.text)}  ':fontsize=20:fontcolor=${fgColor}:box=1:boxcolor=${bgColor}:x=W-${speed}*t:y=H-50`
    );
  }

  // Clock (current time)
  if (ov.clock && ov.clock.show) {
    const clockColor = (ov.clock.color || "#ffff00").replace("#","0x");
    const fmt = ov.clock.format === "12h" ? "%I\\:%M\\:%S %p" : "%H\\:%M\\:%S";
    drawFilters.push(
      `drawtext=text='%{pts\\:localtime\\:0\\:${fmt}}':fontsize=22:fontcolor=${clockColor}:x=W-160:y=10:shadowx=1:shadowy=1:shadowcolor=0x000000`
    );
    if (ov.clock.showDate) {
      drawFilters.push(
        `drawtext=text='%{pts\\:localtime\\:0\\:%d %b %Y}':fontsize=16:fontcolor=${clockColor}:x=W-160:y=36:shadowx=1:shadowy=1:shadowcolor=0x000000`
      );
    }
  }

  // Color patti (strip)
  if (ov.patti && ov.patti.show) {
    const p = ov.patti;
    const col = (p.color || "#003366").replace("#","0x") + "cc";
    const h   = `H*${p.height || 8}/100`;
    const yPos = p.position === "top" ? "0" : `H-${h}`;
    drawFilters.push(
      `drawbox=x=0:y=${yPos}:w=W:h=${h}:color=${col}:t=fill`
    );
  }

  // Chain all drawtext/drawbox filters
  if (drawFilters.length > 0) {
    let chain = `[${videoTag}]`;
    // Unwrap if tag has brackets
    if (!videoTag.startsWith("[")) chain = `[${videoTag}]`;
    const combined = drawFilters.join(",");
    filters.push(`${videoTag.startsWith("[") ? videoTag : "[" + videoTag + "]"}${combined}[vfinal]`);
    videoTag = "[vfinal]";
  }

  // Assemble -filter_complex
  if (filters.length > 0) {
    args.push("-filter_complex", filters.join(";"));
    args.push("-map", videoTag.replace(/[\[\]]/g, "") === "0:v" ? "0:v" : videoTag);
    if (audioTag !== "0:a") {
      args.push("-map", audioTag);
    } else {
      args.push("-map", "0:a?");
    }
  } else {
    args.push("-map", "0:v", "-map", "0:a?");
  }

  // ── Encoding ──
  args.push(
    "-c:v",      "libx264",
    "-preset",   "veryfast",
    "-tune",     "zerolatency",
    "-crf",      "23",
    "-maxrate",  "2000k",
    "-bufsize",  "4000k",
    "-pix_fmt",  "yuv420p",
    "-g",        "48",
    "-sc_threshold", "0",
    "-c:a",      "aac",
    "-b:a",      "128k",
    "-ar",       "44100",
    "-ac",       "2",
  );

  // ── HLS output ──
  args.push(
    "-f",                 "hls",
    "-hls_time",          "4",
    "-hls_list_size",     "5",
    "-hls_flags",         "delete_segments+append_list",
    "-hls_segment_type",  "mpegts",
    "-hls_segment_filename", outSeg,
    outM3u8
  );

  return { args, inputSource: source.url };
}

function escapeText(t) {
  return (t || "").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

module.exports = { buildFFmpegArgs };
