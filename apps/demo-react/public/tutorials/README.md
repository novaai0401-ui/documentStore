# How-to videos for the in-app Help Center

The **❔ Help & How-to** button in the app top bar opens the Help Center — a
gallery of short tutorials for every tool. Each tutorial already shows written
steps; you attach a video whenever you've recorded one.

There are three ways to host a video. Pick whichever is easiest — you can mix
them per tutorial.

## Option 1 — Self-hosted file (fully private, works offline)

1. Record a short clip (30–90s). Export as **MP4 (H.264)** or **WebM**, ideally
   ≤ 1080p and ≤ ~15 MB so it loads fast on mobile data.
   - Tip: you can even record it *with this app* — the **Record screen** tool.
2. Drop the file in this folder: `apps/demo-react/public/tutorials/`
   e.g. `make-a-card.mp4`
3. In `apps/demo-react/src/v2/studio/tutorials.ts`, set the tutorial's `video`:
   ```ts
   video: { kind: 'file', src: 'make-a-card.mp4' },
   durationSec: 62,   // optional, shows as 1:02 on the card
   ```

Keep files small — they ship inside the app build. For many/long videos, prefer
Option 2 so the build stays lean.

## Option 2 — YouTube (free hosting, no repo bloat) — recommended for lots of videos

1. Upload the clip to YouTube and set it to **Unlisted** (not Private, or the
   embed won't play; Unlisted means only people with the link/embed see it).
2. Copy the video id from the URL — `https://youtu.be/**abcd1234XYZ**`.
3. Set the tutorial's `video`:
   ```ts
   video: { kind: 'youtube', id: 'abcd1234XYZ' },
   ```
The player uses the privacy-friendly `youtube-nocookie.com` host.

## Option 3 — Vimeo

```ts
video: { kind: 'vimeo', id: '123456789' },
```

## Adding a brand-new tutorial

Add an entry to the `TUTORIALS` array in `tutorials.ts`:
```ts
{
  id: 'my-guide', tool: 'someTool', title: 'How to do X', emoji: '✨',
  category: 'Getting started',
  blurb: 'One line describing it.',
  steps: ['Do this', 'Then this', 'Finally this'],
  video: { kind: 'youtube', id: '...' },   // optional
},
```
`tool` should match the tool it teaches, so a future "Watch how" button on that
tool can deep-link straight to the guide.

No video yet? Leave `video` off — the Help Center shows the steps and a
"video coming soon" note, so it's useful immediately.

## Auto-recording (optional) — generate real screen recordings

The `.webm` files here were produced by **driving the real app** and recording
the screen, so they show the actual UI, not a slideshow:

```bash
pnpm build                       # build the app first
pnpm add -D -w playwright        # one-time (browsers are already installed)
node scripts/record-tutorials.mjs            # re-record all scripted flows
node scripts/record-tutorials.mjs photo-art  # …or just one
```

The scripted flows live in `scripts/record-tutorials.mjs`. Re-run it after a UI
change to refresh the clips, or add a new flow there for a new tutorial. Prefer
your own hand-recorded videos? Just drop them in and skip the script.

