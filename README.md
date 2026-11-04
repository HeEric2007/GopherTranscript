# GopherTranscript (unofficial)

A bookmarklet that saves transcripts of UNITE lecture videos, either one lecture at a time or every lecture in a course as a single .zip.

UNITE videos have auto-generated captions, and the player shows a searchable transcript, but there's no way to download it. Having the transcript as a file makes it much easier to review lectures with a screen reader, text-to-speech, translation tools, or your own notes.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by the University of Minnesota or UNITE. If you need captions or transcripts as a formal accommodation, contact the **Disability Resource Center**.

## Install

Go to **https://heeric2007.github.io/GopherTranscript/** and drag the gold **GopherTranscript** button onto your bookmarks bar.

If you can't drag it, that page has a **Copy bookmark code** button. Make a new bookmark, name it GopherTranscript, and paste the code in as the URL.

Works in Chrome, Edge, Safari, and Firefox on a computer.

## How to use it

1. Log in to UNITE and open one of your courses.
2. Click **GopherTranscript** in your bookmarks bar. A panel appears in the bottom-right corner of the page.

**On a course page** (the list of all of a course's lectures), click **Save all lectures (.zip)**:

- It goes through every lecture on the page, oldest first, and saves one .zip with a numbered transcript for each, like `01 CSCI 2033-1 September 9 Lecture (multi-source).txt`.
- Check **Also include .vtt caption files** if you want those too.
- A full semester takes a few minutes. Keep the tab open while it runs. **Stop** finishes the current lecture and saves what's done so far.
- Lectures without captions are listed in `_skipped lectures.txt` inside the zip.

**On a single lecture page**, the panel has two buttons:

- **Text (.txt)**: the transcript in paragraphs, with a timestamp at the start of each one.
- **Captions (.vtt)**: the caption file with timings, which works in VLC and most video players.

Files are named after the lecture, for example `CSCI 2033-1 November 4 Lecture (multi-source).txt`.

If you close the panel, click the bookmark again to bring it back. If it says it can't find captions, press play for a few seconds and try again.

## How it works

- UNITE uses Kaltura's video player, which loads each lecture's captions as WebVTT files in about 5-minute pieces. The bookmarklet finds the caption list the player requested, downloads the same pieces, joins them, and saves the result to your computer.
- **Save all** opens each lecture's page in a hidden frame, one at a time, just long enough for the player to load its captions. Videos stay paused and muted, and the frame is closed right after.
- Everything runs in your browser using your existing UNITE login. It never sees your password and only talks to UNITE's caption server. There's no tracking.
- It pauses between requests so it doesn't put extra load on UNITE.

## Please use it responsibly

- Use transcripts for your own studying. Don't post, sell, or share them. Lectures belong to your instructors.
- Captions are machine-generated and will have mistakes, especially with names, math, and code. Check against the video when it matters.
- If an instructor asks you not to save transcripts for their course, don't.

## Updating

When a new version comes out, delete your old GopherTranscript bookmark and drag the new button from the install page. The version number is at the bottom of that page.

## Development

The bookmarklet source is `gophertranscript.js`. After changing it, rebuild:

```
npm install
npm run build
```

This minifies the script into `docs/bookmarklet.js` and generates the install page, `docs/index.html`, from `docs/template.html`. GitHub Pages serves the `docs` folder. Bump `version` in `package.json` for each release, since the install page shows it.

If UNITE changes how captions load and the bookmarklet stops finding them, start with `PLAYLIST_RE` and `findPlaylistIn` near the top of `gophertranscript.js`. When reporting a problem, include the lecture page URL (leave out any `ks=` or token values) and what the panel said.

## License

MIT. See `LICENSE`.
