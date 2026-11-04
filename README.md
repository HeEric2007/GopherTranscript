# GopherTranscript (unofficial)

A small Chrome extension that adds a **Save transcript** panel to UNITE lecture video pages, so you can keep a readable text transcript of a lecture you already have access to.

UNITE videos come with auto-generated captions, and the player shows a searchable transcript, but there's no way to save it. That makes it hard to review lectures with a screen reader, text-to-speech, translation tools, or your own notes. This extension fills that gap.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by the University of Minnesota or UNITE. If you need captions or transcripts as a formal accommodation, contact the **Disability Resource Center**. They can make sure every course provides them.

## What it does

**On a lecture page** (`media.unite.umn.edu/portal/player.php`), a small panel appears in the bottom-right corner:

- **Text (.txt)** saves a transcript in paragraphs, with a timestamp at the start of each one.
- **Captions (.vtt)** saves the full caption file with timings, which works in VLC and most video players and note apps.

Files are named after the lecture, for example `CSCI 2033-1 November 4 Lecture (multi-source).txt`.

**On a course page** (`media.unite.umn.edu/portal/course.php`, the list of all lectures), the panel offers **Save all lectures (.zip)**:

- It goes through every lecture on the page, oldest first, and saves one `.zip` with a numbered transcript for each, like `01 CSCI 2033-1 September 9 Lecture (multi-source).txt`.
- Tick **Also include .vtt caption files** to get the caption files too.
- A full semester takes a few minutes. You can keep using other tabs, and **Stop** saves whatever is done so far.
- Lectures without captions are listed in `_skipped lectures.txt` inside the zip.

## Install

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder (the one that contains `manifest.json`).
5. Open a lecture on UNITE. The panel shows up in the corner.

If it says no captions were found, press play for a few seconds and try again.

## Privacy and how it works

- It needs **no extension permissions** and never sees your password. You log in to UNITE the normal way.
- The video player already downloads the captions in roughly 5-minute pieces. The extension reads which caption file the player asked for, downloads those same pieces, joins them, and saves the result to your computer.
- Nothing is sent anywhere except UNITE's own caption server, and only when you click a button. There's no tracking or analytics.
- **Save all** opens each lecture's page in a hidden frame, one at a time, just long enough for the player to load its captions. Videos stay paused and muted, and the frame is closed right after.
- It pauses between requests and between lectures so it doesn't put extra load on the servers.

## Ground rules

- **Use it for your own studying.** Don't post, sell, or share transcripts. Lectures belong to the instructors, and this project only exists as an accessibility tool.
- Captions are machine-generated and will have mistakes, especially with names, math, and code. Check against the video when it matters.
- If your instructor or the university asks you not to save transcripts for a course, don't.

## When it breaks

UNITE uses Kaltura's video player. If they change how captions are loaded, the extension may stop finding them. Most fixes will be in `PLAYLIST_RE` and `waitForPlaylist` near the top of `content.js`. Please open an issue with the lecture page URL (without any `ks=` or token values) and what the panel said.

## Contributing

Pull requests are welcome. Please keep it permission-free and local-only. Some ideas:

- Better paragraph and sentence splitting
- A "Save all" button on the UNITE home page that covers every course
- Firefox support

## License

MIT. See `LICENSE`.
