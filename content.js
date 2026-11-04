// GopherTranscript (unofficial)
// Runs on UNITE player pages. The video player already downloads the
// lecture's captions (WebVTT, split into ~5 minute chunks behind an .m3u8
// playlist). This script finds that playlist, fetches the same chunks the
// player uses, stitches them together, and lets you save the result.
// Nothing is sent anywhere else, and no login details are touched.

(() => {
  if (window.__ltsLoaded) return;
  window.__ltsLoaded = true;

  const PAUSE_BETWEEN_REQUESTS_MS = 250; // be gentle with the servers
  const PLAYLIST_RE = /serveWebVTT.*\.m3u8(\?|$)/;
  const PARAGRAPH_MAX_SECONDS = 60;
  const PARAGRAPH_GAP_SECONDS = 4;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- 1. Watch for the caption playlist the player requests ------------

  let playlistUrl = null;
  const playlistWaiters = [];

  function notePlaylist(url) {
    if (playlistUrl || !PLAYLIST_RE.test(url)) return;
    playlistUrl = url;
    playlistWaiters.splice(0).forEach((resolve) => resolve(url));
  }

  try {
    // Video segments fill the default 250-entry buffer quickly.
    performance.setResourceTimingBufferSize(5000);
    performance.getEntriesByType("resource").forEach((e) => notePlaylist(e.name));
    new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => notePlaylist(e.name));
    }).observe({ type: "resource", buffered: true });
  } catch (_) {
    /* older browsers: we still check getEntriesByType on click */
  }

  function waitForPlaylist(timeoutMs) {
    if (!playlistUrl) {
      const found = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => PLAYLIST_RE.test(n));
      if (found) notePlaylist(found);
    }
    if (playlistUrl) return Promise.resolve(playlistUrl);
    return new Promise((resolve) => {
      playlistWaiters.push(resolve);
      setTimeout(() => resolve(playlistUrl), timeoutMs);
    });
  }

  // ---- 2. Fetch and parse the captions ----------------------------------

  function toSeconds(ts) {
    const parts = ts.trim().split(":").map(Number);
    return parts.reduce((total, p) => total * 60 + p, 0);
  }

  function formatClock(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  function decodeEntities(text) {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }

  function parseVtt(text) {
    const cues = [];
    for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
      const lines = block.split("\n");
      const timingIndex = lines.findIndex((l) => l.includes("-->"));
      if (timingIndex < 0) continue;
      const [startRaw, rest] = lines[timingIndex].split("-->");
      const endRaw = rest.trim().split(/\s+/)[0];
      const body = decodeEntities(
        lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "")
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!body) continue;
      cues.push({ start: toSeconds(startRaw), end: toSeconds(endRaw), text: body });
    }
    return cues;
  }

  async function fetchAllCues(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`caption list request failed (${res.status})`);
    const playlist = await res.text();
    const segmentUrls = playlist
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => new URL(l, url).href);
    if (segmentUrls.length === 0) throw new Error("the caption list was empty");

    const seen = new Set();
    const cues = [];
    for (let i = 0; i < segmentUrls.length; i++) {
      onProgress(`Downloading captions ${i + 1} of ${segmentUrls.length}…`);
      const segRes = await fetch(segmentUrls[i]);
      if (!segRes.ok) throw new Error(`caption part ${i + 1} failed (${segRes.status})`);
      for (const cue of parseVtt(await segRes.text())) {
        const key = `${cue.start}|${cue.text}`; // cues can repeat across chunks
        if (seen.has(key)) continue;
        seen.add(key);
        cues.push(cue);
      }
      if (i < segmentUrls.length - 1) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
    }
    cues.sort((a, b) => a.start - b.start);
    return cues;
  }

  // ---- 3. Build the output files ----------------------------------------

  function lectureTitle() {
    try {
      const players = window.KalturaPlayer?.getPlayers?.() || {};
      const name = Object.values(players)[0]?.sources?.metadata?.name;
      if (name) return name.trim();
    } catch (_) {}
    const id = new URLSearchParams(location.search).get("media_id");
    return `UNITE lecture ${id || ""}`.trim();
  }

  function buildTranscript(title, cues) {
    const paragraphs = [];
    let current = null;
    for (const cue of cues) {
      const startNew =
        !current ||
        cue.start - current.lastEnd > PARAGRAPH_GAP_SECONDS ||
        cue.start - current.start >= PARAGRAPH_MAX_SECONDS;
      if (startNew) {
        current = { start: cue.start, lastEnd: cue.end, words: [] };
        paragraphs.push(current);
      }
      current.words.push(cue.text);
      current.lastEnd = Math.max(current.lastEnd, cue.end);
    }
    const header = [
      title,
      "Transcript from the video's auto-generated captions, which may contain errors.",
      `Saved ${new Date().toLocaleString()} from ${location.origin}${location.pathname}?media_id=${
        new URLSearchParams(location.search).get("media_id") || ""
      }`,
    ];
    const body = paragraphs.map((p) => `[${formatClock(p.start)}] ${p.words.join(" ")}`);
    return header.join("\n") + "\n\n" + body.join("\n\n") + "\n";
  }

  function vttStamp(seconds) {
    const ms = Math.round(seconds * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    const milli = String(ms % 1000).padStart(3, "0");
    return `${h}:${m}:${s}.${milli}`;
  }

  function buildVtt(cues) {
    return (
      "WEBVTT\n\n" +
      cues.map((c) => `${vttStamp(c.start)} --> ${vttStamp(c.end)}\n${c.text}`).join("\n\n") +
      "\n"
    );
  }

  function safeFileName(title) {
    return title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "lecture";
  }

  function saveFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---- 4. The on-page panel ----------------------------------------------

  let cachedCues = null;

  async function getCues(setStatus) {
    if (cachedCues) return cachedCues;
    setStatus("Looking for this lecture's captions…");
    const url = await waitForPlaylist(15000);
    if (!url) {
      throw new Error(
        "no captions found yet. Press play for a few seconds and try again. " +
          "If this lecture has no captions, the Disability Resource Center can request them."
      );
    }
    cachedCues = await fetchAllCues(url, setStatus);
    if (cachedCues.length === 0) throw new Error("the captions for this lecture are empty");
    return cachedCues;
  }

  function buildPanel() {
    const host = document.createElement("div");
    host.id = "gophertranscript-panel";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel { font: 14px/1.4 system-ui, -apple-system, sans-serif; background:#fff; color:#1a1a1a;
                 border:1px solid #c9c9c9; border-radius:10px; padding:12px; width:260px;
                 box-shadow:0 4px 16px rgba(0,0,0,.18); }
        h2 { font-size:14px; margin:0 0 8px; }
        .row { display:flex; gap:8px; }
        button { flex:1; font:inherit; padding:8px 6px; border-radius:6px; cursor:pointer;
                 border:1px solid #7a0019; background:#7a0019; color:#fff; }
        button.secondary { background:#fff; color:#7a0019; }
        button:disabled { opacity:.6; cursor:progress; }
        button:focus-visible { outline:3px solid #ffb71e; outline-offset:2px; }
        .status { margin-top:8px; font-size:13px; color:#444; min-height:1em; }
        .close { position:absolute; top:4px; right:8px; flex:none; background:none; border:none;
                 color:#666; font-size:18px; padding:2px 6px; }
      </style>
      <div class="panel" role="region" aria-label="Lecture transcript">
        <button class="close" aria-label="Hide transcript panel">×</button>
        <h2>Save transcript</h2>
        <div class="row">
          <button class="txt">Text (.txt)</button>
          <button class="vtt secondary">Captions (.vtt)</button>
        </div>
        <div class="status" role="status" aria-live="polite"></div>
      </div>`;

    const status = root.querySelector(".status");
    const buttons = [...root.querySelectorAll(".row button")];
    const setStatus = (msg) => (status.textContent = msg);

    async function run(kind) {
      buttons.forEach((b) => (b.disabled = true));
      try {
        const cues = await getCues(setStatus);
        const title = lectureTitle();
        const base = safeFileName(title);
        if (kind === "txt") {
          saveFile(`${base}.txt`, buildTranscript(title, cues), "text/plain;charset=utf-8");
        } else {
          saveFile(`${base}.vtt`, buildVtt(cues), "text/vtt;charset=utf-8");
        }
        setStatus(`Saved ${cues.length} caption lines.`);
      } catch (err) {
        setStatus(`Couldn't save: ${err.message}`);
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    }

    root.querySelector(".txt").addEventListener("click", () => run("txt"));
    root.querySelector(".vtt").addEventListener("click", () => run("vtt"));
    root.querySelector(".close").addEventListener("click", () => host.remove());
    document.body.appendChild(host);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
