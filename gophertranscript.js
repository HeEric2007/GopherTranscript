// GopherTranscript (unofficial)
// Copyright (c) 2026 Eric He. MIT License (see LICENSE).
//
// Lecture pages (player.php): the video player already downloads the
// lecture's captions (WebVTT, split into ~5 minute chunks behind an .m3u8
// playlist). This script finds that playlist, fetches the same chunks the
// player uses, stitches them together, and lets you save the result.
//
// Course pages (course.php): "Save all" opens each lecture's player page in
// a hidden frame, one at a time, picks up its caption playlist the same way,
// and bundles every transcript into a single .zip.
//
// Canvas pages (canvas.umn.edu): lecture videos are embedded through
// Kaltura's Canvas tool, in a frame from kaf.canvas.umn.edu that the page
// can't look inside. The Canvas panel lists those videos with a button to
// open each one by itself.
//
// Kaltura video pages (kaf.canvas.umn.edu): the player's settings include a
// link to its caption file (SRT or WebVTT). This script downloads that file
// and saves it as a transcript.
//
// Nothing is sent anywhere else, and no login details are touched.
//
// This is the bookmarklet source. scripts/build-bookmarklet.mjs minifies it
// into the javascript: link on the install page (docs/index.html).

(() => {
  // Clicked again on the same page (or after closing the panel): bring it back.
  if (window.__gtLoaded) {
    window.__gtShowPanel?.();
    return;
  }

  const PAUSE_BETWEEN_REQUESTS_MS = 250; // between caption chunks
  const PAUSE_BETWEEN_LECTURES_MS = 1000; // between lectures in "Save all"
  const LECTURE_LOAD_TIMEOUT_MS = 20000;
  const PLAYLIST_RE = /serveWebVTT.*\.m3u8(\?|$)/;
  const PARAGRAPH_MAX_SECONDS = 60;
  const PARAGRAPH_GAP_SECONDS = 4;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const onUnite = location.hostname === "media.unite.umn.edu";
  const isPlayerPage = onUnite && /\/portal\/player\.php$/.test(location.pathname);
  const isCoursePage = onUnite && /\/portal\/course\.php$/.test(location.pathname);
  const isCanvasPage = location.hostname === "canvas.umn.edu";
  const isKafPage = location.hostname === "kaf.canvas.umn.edu";
  if (!isPlayerPage && !isCoursePage && !isCanvasPage && !isKafPage) {
    // Clicked somewhere GopherTranscript doesn't work.
    window.alert(
      onUnite
        ? "GopherTranscript: open one of your courses (the page that lists its lecture videos) or a single lecture, then click GopherTranscript again."
        : "GopherTranscript works on UNITE lecture pages (media.unite.umn.edu) and on Canvas pages with lecture videos. Open one of those, then click GopherTranscript again."
    );
    return;
  }
  window.__gtLoaded = true;

  // ---- Captions: fetch and parse ------------------------------------------

  function findPlaylistIn(win) {
    return (
      win.performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => PLAYLIST_RE.test(n)) || null
    );
  }

  function playerTitleIn(win) {
    try {
      const players = win.KalturaPlayer?.getPlayers?.() || {};
      const name = Object.values(players)[0]?.sources?.metadata?.name;
      if (name) return name.trim();
    } catch (_) {}
    return null;
  }

  function toSeconds(ts) {
    return ts
      .trim()
      .replace(",", ".") // SRT uses 00:01:02,500
      .split(":")
      .map(Number)
      .reduce((total, p) => total * 60 + p, 0);
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
      onProgress(i + 1, segmentUrls.length);
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

  // ---- Output formats -----------------------------------------------------

  function buildTranscript(title, cues, source) {
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
      `Saved ${new Date().toLocaleString()} from ${source}`,
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
    return (
      title
        .replace(/[\\/]+/g, "-") // "11/02/2026" -> "11-02-2026"
        .replace(/[:*?"<>|]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "lecture"
    );
  }

  function lecturePageUrl(href) {
    const u = new URL(href, location.href);
    return `${u.origin}${u.pathname}?media_id=${u.searchParams.get("media_id") || ""}`;
  }

  function saveBlob(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ---- Minimal .zip writer (no compression; text files are small) --------
  // ZIP-START
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // files: [{ name: string, text: string }] -> Uint8Array of a .zip archive
  function makeZip(files, date = new Date()) {
    const enc = new TextEncoder();
    const dosTime =
      (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate =
      (Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

    const chunks = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const name = enc.encode(file.name);
      const data = enc.encode(file.text);
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 file names
      local.setUint16(8, 0, true); // stored
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);

      offset += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);

    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
    let pos = 0;
    for (const c of all) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }
  // ZIP-END

  // ---- Panel UI -----------------------------------------------------------

  function createPanel(heading, innerHtml, width = 280) {
    const host = document.createElement("div");
    host.id = "gophertranscript-panel";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel { font: 14px/1.4 system-ui, -apple-system, sans-serif; background:#fff; color:#1a1a1a;
                 border:1px solid #c9c9c9; border-radius:10px; padding:12px; width:${width}px;
                 max-width:calc(100vw - 32px); box-sizing:border-box;
                 box-shadow:0 4px 16px rgba(0,0,0,.18); position:relative; }
        h2 { font-size:14px; margin:0 24px 8px 0; }
        .hint { font-size:13px; color:#444; margin:0 0 8px; }
        .source { font-size:12px; color:#666; margin:-4px 0 8px; }
        ul.videos { list-style:none; margin:0; padding:0; max-height:260px; overflow:auto; }
        ul.videos li { display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid #e6e6e6; }
        ul.videos .vtitle { flex:1; font-size:13px; overflow-wrap:anywhere; }
        a.open { flex:none; font-size:13px; font-weight:600; text-decoration:none; color:#fff; background:#7a0019;
                 border-radius:6px; padding:6px 10px; }
        a.open:focus-visible { outline:3px solid #ffb71e; outline-offset:2px; }
        .row { display:flex; gap:8px; }
        button { flex:1; font:inherit; padding:8px 6px; border-radius:6px; cursor:pointer;
                 border:1px solid #7a0019; background:#7a0019; color:#fff; }
        button.secondary { background:#fff; color:#7a0019; }
        button:disabled { opacity:.6; cursor:progress; }
        button:focus-visible, input:focus-visible { outline:3px solid #ffb71e; outline-offset:2px; }
        label { display:flex; gap:6px; align-items:center; font-size:13px; margin-top:8px; }
        .status { margin-top:8px; font-size:13px; color:#444; min-height:1em; }
        .close { position:absolute; top:4px; right:8px; flex:none; background:none; border:none;
                 color:#666; font-size:18px; padding:2px 6px; }
        [hidden] { display:none !important; }
      </style>
      <div class="panel" role="region" aria-label="${heading}">
        <button class="close" aria-label="Hide transcript panel">×</button>
        <h2>${heading}</h2>
        ${innerHtml}
        <div class="status" role="status" aria-live="polite"></div>
      </div>`;
    // Hide rather than remove, so a running "Save all" keeps its progress.
    root.querySelector(".close").addEventListener("click", () => (host.style.display = "none"));
    document.body.appendChild(host);
    const status = root.querySelector(".status");
    return { root, setStatus: (msg) => (status.textContent = msg) };
  }

  // Shows the panel now (or once the page has loaded), and lets a second
  // click on the bookmarklet bring it back after it's closed.
  function registerPanel(start) {
    window.__gtShowPanel = () => {
      const existing = document.getElementById("gophertranscript-panel");
      if (existing) existing.style.display = "";
      else start();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  // ---- One video: the "Save transcript" panel -----------------------------
  // loadCues(setStatus) resolves to the caption cues; describe() returns
  // { title, source } for the file name and the transcript header.

  function setUpSavePanel({ sourceNote, loadCues, describe }) {
    let cachedCues = null;

    function start() {
      const { root, setStatus } = createPanel(
        "Save transcript",
        `${sourceNote ? `<p class="source">${sourceNote}</p>` : ""}
         <div class="row">
           <button class="txt">Text (.txt)</button>
           <button class="vtt secondary">Captions (.vtt)</button>
         </div>`
      );
      const buttons = [...root.querySelectorAll(".row button")];

      async function run(kind) {
        buttons.forEach((b) => (b.disabled = true));
        try {
          if (!cachedCues) {
            cachedCues = await loadCues(setStatus);
            if (cachedCues.length === 0) throw new Error("the captions for this video are empty");
          }
          const { title, source } = describe();
          const base = safeFileName(title);
          if (kind === "txt") {
            const text = buildTranscript(title, cachedCues, source);
            saveBlob(`${base}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
          } else {
            saveBlob(`${base}.vtt`, new Blob([buildVtt(cachedCues)], { type: "text/vtt;charset=utf-8" }));
          }
          setStatus(`Saved ${cachedCues.length} caption lines.`);
        } catch (err) {
          cachedCues = null;
          setStatus(`Couldn't save: ${err.message}`);
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      }

      root.querySelector(".txt").addEventListener("click", () => run("txt"));
      root.querySelector(".vtt").addEventListener("click", () => run("vtt"));
    }

    registerPanel(start);
  }

  // ---- UNITE lecture page --------------------------------------------------

  function setUpPlayerPage() {
    let playlistUrl = null;
    const waiters = [];
    const note = (url) => {
      if (playlistUrl || !PLAYLIST_RE.test(url)) return;
      playlistUrl = url;
      waiters.splice(0).forEach((resolve) => resolve(url));
    };
    try {
      // Video segments fill the default 250-entry buffer quickly.
      performance.setResourceTimingBufferSize(5000);
      new PerformanceObserver((list) => list.getEntries().forEach((e) => note(e.name))).observe({
        type: "resource",
        buffered: true,
      });
    } catch (_) {}

    function waitForPlaylist(timeoutMs) {
      if (!playlistUrl) {
        const found = findPlaylistIn(window);
        if (found) note(found);
      }
      if (playlistUrl) return Promise.resolve(playlistUrl);
      return new Promise((resolve) => {
        waiters.push(resolve);
        setTimeout(() => resolve(playlistUrl), timeoutMs);
      });
    }

    setUpSavePanel({
      async loadCues(setStatus) {
        setStatus("Looking for this lecture's captions…");
        const url = await waitForPlaylist(15000);
        if (!url) {
          throw new Error(
            "no captions found yet. Press play for a few seconds and try again. " +
              "If this lecture has no captions, the Disability Resource Center can request them."
          );
        }
        return fetchAllCues(url, (i, n) => setStatus(`Downloading captions ${i} of ${n}…`));
      },
      describe: () => ({
        title:
          playerTitleIn(window) ||
          `UNITE lecture ${new URLSearchParams(location.search).get("media_id") || ""}`.trim(),
        source: lecturePageUrl(location.href),
      }),
    });
  }

  // ---- Kaltura video page from Canvas (kaf.canvas.umn.edu) -----------------

  function kafPlayer() {
    try {
      return Object.values(window.KalturaPlayer?.getPlayers?.() || {})[0] || null;
    } catch (_) {
      return null;
    }
  }

  // Waits for the player to load the video's details, which include its
  // caption tracks.
  async function waitForKafSources(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const player = kafPlayer();
      if (player?.sources?.id) return player;
      await sleep(400);
    }
    return kafPlayer();
  }

  // Prefers English, and human-made captions over auto-generated ones.
  function pickCaption(captions) {
    const readable = captions.filter((c) => c.url && /^(srt|vtt|webvtt)$/i.test(c.type || "srt"));
    const english = readable.filter((c) => /^en/i.test(c.language || "") || /english/i.test(c.label || ""));
    const pool = english.length ? english : readable;
    return pool.find((c) => !/auto/i.test(c.label || "")) || pool[0] || null;
  }

  function setUpKafPage() {
    setUpSavePanel({
      sourceNote: "Canvas video",
      async loadCues(setStatus) {
        setStatus("Looking for this video's captions…");
        const player = await waitForKafSources(15000);
        if (!player) throw new Error("no video player found on this page.");
        const captions = player.sources?.captions || [];
        if (captions.length === 0) {
          throw new Error(
            "this video has no captions. The Disability Resource Center can request them."
          );
        }
        const caption = pickCaption(captions);
        if (!caption) throw new Error("this video's captions are in a format GopherTranscript can't read yet.");
        setStatus(`Downloading captions (${caption.label || caption.language || "captions"})…`);
        const res = await fetch(caption.url);
        if (!res.ok) throw new Error(`caption request failed (${res.status})`);
        const seen = new Set();
        return parseVtt(await res.text())
          .filter((c) => {
            const key = `${c.start}|${c.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.start - b.start);
      },
      describe: () => {
        const sources = kafPlayer()?.sources || {};
        return {
          title: sources.metadata?.name?.trim() || `Canvas video ${sources.id || ""}`.trim(),
          source: `Canvas (Kaltura video ${sources.id || "unknown"})`,
        };
      },
    });
  }

  // ---- Canvas page: list the embedded videos -------------------------------

  // Kaltura videos on Canvas pages are embedded as external-tool frames.
  function canvasVideos() {
    const seen = new Set();
    const videos = [];
    for (const frame of document.querySelectorAll("iframe")) {
      let url;
      try {
        url = new URL(frame.getAttribute("src") || "", location.href);
      } catch (_) {
        continue;
      }
      const isEmbed =
        url.hostname === "kaf.canvas.umn.edu" ||
        (url.hostname === location.hostname && /\/external_tools\/(retrieve|\d+)/.test(url.pathname));
      if (!isEmbed || seen.has(url.href)) continue;
      seen.add(url.href);
      const title = (frame.title || "").trim();
      videos.push({ href: url.href, title: title && !/^(error|kaltura)$/i.test(title) ? title : "" });
    }
    return videos.map((v, i) => ({ ...v, title: v.title || `Video ${i + 1}` }));
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function setUpCanvasPage() {
    function start() {
      const videos = canvasVideos();
      const list = videos.length
        ? `<p class="hint">Canvas keeps videos in a protected frame, so open one by itself, then click GopherTranscript again on that page to save it.</p>
           <ul class="videos">${videos
             .map(
               (v) => `<li><span class="vtitle">${escapeHtml(v.title)}</span>
                 <a class="open" href="${escapeHtml(v.href)}" target="_blank" rel="noopener">Open video</a></li>`
             )
             .join("")}</ul>`
        : `<p class="hint">No lecture videos found on this page. Open the Canvas page that has the video player (for example, the week's lecture page), then click GopherTranscript again.</p>`;
      createPanel(
        videos.length === 1 ? "1 video on this page" : `${videos.length || "No"} videos on this page`,
        list,
        320
      );
    }
    registerPanel(start);
  }

  // ---- Course page: save every lecture ------------------------------------

  // Opens one lecture's player page in a hidden frame and waits for it to
  // request its caption playlist. Videos stay paused and muted.
  function loadLectureInFrame(href, timeoutMs) {
    return new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText =
        "position:fixed;left:-10000px;top:0;width:640px;height:360px;border:0;visibility:hidden;";
      frame.src = href;
      const startedAt = Date.now();
      let title = null;

      const finish = (playlistUrl) => {
        clearInterval(timer);
        frame.remove();
        resolve({ playlistUrl, title });
      };

      const timer = setInterval(() => {
        try {
          const win = frame.contentWindow;
          if (win) {
            win.document.querySelectorAll("video").forEach((v) => {
              v.muted = true;
              if (!v.paused) v.pause();
            });
            title = playerTitleIn(win) || title;
            const found = findPlaylistIn(win);
            if (found) {
              // Give the title a moment to show up if it hasn't yet.
              if (title || Date.now() - startedAt > 4000) return finish(found);
            }
          }
        } catch (_) {
          /* frame still loading */
        }
        if (Date.now() - startedAt > timeoutMs) finish(null);
      }, 400);

      document.body.appendChild(frame);
    });
  }

  function setUpCoursePage() {
    function start() {
      const seen = new Set();
      const lectures = [...document.querySelectorAll('a[href*="player.php?media_id="]')]
        .filter((a) => a.textContent.trim() && !seen.has(a.href) && seen.add(a.href))
        .map((a) => ({ href: a.href, label: a.textContent.trim() }))
        .reverse(); // page lists newest first; save oldest first
      if (lectures.length === 0) return;

      const courseTitle = document.title.replace(/:\s*UNITE Videos\s*$/i, "").trim() || "UNITE course";

      const { root, setStatus } = createPanel(
        "Save all transcripts",
        `<div class="row">
           <button class="all">Save all ${lectures.length} lectures (.zip)</button>
           <button class="cancel secondary" hidden>Stop</button>
         </div>
         <label><input type="checkbox" class="withVtt"> Also include .vtt caption files</label>`
      );
      const allBtn = root.querySelector(".all");
      const cancelBtn = root.querySelector(".cancel");
      const withVtt = root.querySelector(".withVtt");
      let cancelled = false;

      cancelBtn.addEventListener("click", () => {
        cancelled = true;
        cancelBtn.disabled = true;
        setStatus("Stopping after this lecture…");
      });

      allBtn.addEventListener("click", async () => {
        cancelled = false;
        allBtn.disabled = true;
        withVtt.disabled = true;
        cancelBtn.hidden = false;
        cancelBtn.disabled = false;

        const files = [];
        const missing = [];
        let saved = 0;

        for (let i = 0; i < lectures.length && !cancelled; i++) {
          const lec = lectures[i];
          const prefix = `Lecture ${i + 1} of ${lectures.length} (${lec.label})`;
          setStatus(`${prefix}: opening…`);
          try {
            const { playlistUrl, title: playerTitle } = await loadLectureInFrame(
              lec.href,
              LECTURE_LOAD_TIMEOUT_MS
            );
            if (!playlistUrl) throw new Error("no captions found");
            const cues = await fetchAllCues(playlistUrl, (k, n) =>
              setStatus(`${prefix}: captions ${k} of ${n}…`)
            );
            if (cues.length === 0) throw new Error("captions are empty");
            const title = playerTitle || `${courseTitle} ${lec.label}`;
            const base = `${String(i + 1).padStart(2, "0")} ${safeFileName(title)}`;
            files.push({ name: `${base}.txt`, text: buildTranscript(title, cues, lecturePageUrl(lec.href)) });
            if (withVtt.checked) files.push({ name: `${base}.vtt`, text: buildVtt(cues) });
            saved++;
          } catch (err) {
            missing.push(`${lec.label}: ${err.message} (${lecturePageUrl(lec.href)})`);
          }
          if (i < lectures.length - 1 && !cancelled) await sleep(PAUSE_BETWEEN_LECTURES_MS);
        }

        if (missing.length) {
          files.push({
            name: "_skipped lectures.txt",
            text:
              "These lectures had no captions GopherTranscript could find.\n" +
              "The Disability Resource Center can request captions for them.\n\n" +
              missing.join("\n") +
              "\n",
          });
        }

        if (saved > 0) {
          const zip = makeZip(files);
          saveBlob(`${safeFileName(courseTitle)} transcripts.zip`, new Blob([zip], { type: "application/zip" }));
          const skippedNote = missing.length ? `, skipped ${missing.length}` : "";
          setStatus(`${cancelled ? "Stopped. " : ""}Saved ${saved} of ${lectures.length} lectures${skippedNote}.`);
        } else {
          setStatus(cancelled ? "Stopped before any lectures were saved." : "Couldn't find captions for any lectures.");
        }

        allBtn.disabled = false;
        withVtt.disabled = false;
        cancelBtn.hidden = true;
      });
    }

    registerPanel(start);
  }

  if (isPlayerPage) setUpPlayerPage();
  if (isCoursePage) setUpCoursePage();
  if (isCanvasPage) setUpCanvasPage();
  if (isKafPage) setUpKafPage();
})();
