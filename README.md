# GopherTranscript (unofficial)

A bookmarklet that saves transcripts of lecture videos on UNITE and Canvas. On UNITE it can also save every lecture in a course as a single .zip.

Lecture videos at UMN have auto-generated captions, and the player shows a searchable transcript, but there's no way to download it. Having the transcript as a file makes it much easier to review lectures with a screen reader, text-to-speech, translation tools, or your own notes.

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by the University of Minnesota, UNITE, Canvas, or Kaltura. If you need captions or transcripts as a formal accommodation, contact the **Disability Resource Center**.

## Install

Go to **https://heeric2007.github.io/GopherTranscript/** and drag the gold **🐿️ GopherTranscript** button onto your bookmarks bar. The 🐿️ comes along as part of the bookmark's name, so it's easy to spot.

If you can't drag it, that page has a **Copy bookmark code** button. Make a new bookmark, name it `🐿️ GopherTranscript`, and paste the code in as the URL.

Already have the bookmark? You can just rename it to add the 🐿️.

Works in Chrome, Edge, Safari, and Firefox on a computer.

## Using it on UNITE

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

## Using it on Canvas

This is for lecture videos embedded in Canvas pages, like a week's "Lecture Links" page. Canvas keeps each video in a protected frame that the bookmarklet can't read from the Canvas page itself, so it takes two clicks per video and there's no Save all.

1. On the Canvas page with the video, click **GopherTranscript**. The panel lists the videos on that page.
2. Press **Open video** next to the lecture you want. It opens by itself in a new tab.
3. On that tab, click **GopherTranscript** again and press **Text (.txt)** or **Captions (.vtt)**.

Files are named after the video, for example `PSY1001 F26_11-02-2026 Stress.txt`.

If the panel says there are no videos, you're probably on a page without a video player. Open the page that has the lecture video and try again.

## Tips

- If you close the panel, click the bookmark again to bring it back.
- If it says it can't find captions, press play for a few seconds and try again. Some videos have no captions at all.
- Saving a transcript doesn't count as watching. It won't mark lecture attendance or complete in-video quizzes.

## How it works

- UNITE and Canvas both use Kaltura's video player.
- On UNITE, the player loads each lecture's captions as WebVTT files in about 5-minute pieces. The bookmarklet finds the caption list the player requested, downloads the same pieces, and joins them.
- **Save all** opens each lecture's page in a hidden frame, one at a time, just long enough for the player to load its captions. Videos stay paused and muted, and the frame is closed right after.
- On Canvas, the video opens on `kaf.canvas.umn.edu` (Kaltura's Canvas tool). The player's settings include a link to its caption file (SRT or WebVTT), which the bookmarklet downloads and converts.
- Everything runs in your browser using the login you already have. It never sees your password and only downloads caption files your video player already uses. There's no tracking.
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

If captions stop being found:

- **UNITE:** start with `PLAYLIST_RE` and `findPlaylistIn` near the top of `gophertranscript.js`.
- **Canvas:** start with `canvasVideos` (finding embedded videos) and `pickCaption` (choosing the caption track).

When reporting a problem, include the page URL (leave out any `ks=` or token values) and what the panel said.

## License

MIT. See `LICENSE`.
