/**
 * Help Center — how-to tutorials for the app's tools.
 *
 * Each tutorial has written steps (always shown, useful immediately) and an
 * OPTIONAL video. The site owner records short clips and points each tutorial at
 * one, three ways — whichever is easiest and cheapest for them:
 *   • { kind: 'file',    src: 'intro.mp4' }   → drop the file in public/tutorials/
 *   • { kind: 'youtube', id: 'abc123' }       → an (unlisted) YouTube video, free hosting
 *   • { kind: 'vimeo',   id: '123456789' }
 * A tutorial with no `video` yet still shows its steps + a "video coming soon"
 * note, so the Help Center is useful on day one. Pure & unit-tested; the modal
 * only renders these.
 */

export type VideoSource =
  | { kind: 'file'; src: string }        // public/tutorials/<src>
  | { kind: 'youtube'; id: string }
  | { kind: 'vimeo'; id: string };

export interface Tutorial {
  id: string;
  /** Which home/tool this teaches (also used to deep-link "Watch how" buttons). */
  tool: string;
  title: string;
  emoji: string;
  blurb: string;
  /** Numbered how-to steps — shown even when no video is attached yet. */
  steps: string[];
  category: TutorialCategory;
  /** Optional; omit until the clip is recorded. */
  video?: VideoSource;
  /** Optional runtime in seconds (shows as "2:30" on the card). */
  durationSec?: number;
}

export type TutorialCategory = 'Getting started' | 'Cards & wishes' | 'Family & photos' | 'Video & reels' | 'PDF & docs';
export const TUTORIAL_CATEGORIES: TutorialCategory[] = ['Getting started', 'Cards & wishes', 'Family & photos', 'Video & reels', 'PDF & docs'];

/**
 * The tutorial library. Add a `video` to any entry once the clip is ready (see
 * public/tutorials/README.md). Keep steps short and action-first.
 */
export const TUTORIALS: Tutorial[] = [
  {
    id: 'welcome', tool: 'home', title: 'Welcome to Pyntra — a 1-minute tour', emoji: '👋', category: 'Getting started',
    blurb: 'What you can make here and where everything lives.',
    steps: [
      'Open the app — the home shows tools and ready-made designs.',
      'Use the tabs: “Tools & designs” to create, “Documents” for files.',
      'Tap any card to start; everything works on your phone or computer.',
      'Your work stays on your device — nothing is uploaded.',
    ],
    video: { kind: 'file', src: 'welcome.webm' }, durationSec: 17,
  },
  {
    id: 'make-a-card', tool: 'invitation', title: 'Make a greeting card in 60 seconds', emoji: '💌', category: 'Cards & wishes',
    blurb: 'Pick an occasion, tap a design, personalise, share on WhatsApp.',
    steps: [
      'Tap “Make an invitation” (or “Browse all ready-made designs”).',
      'Choose an occasion tab — Birthday, Diwali, Wedding, Trending…',
      'Tap a design you like — it opens ready to send.',
      'Change the words to your own, then tap Share on WhatsApp.',
    ],
    video: { kind: 'file', src: 'make-a-card.webm' }, durationSec: 18,
  },
  {
    id: 'ai-card', tool: 'prompt', title: 'Design a card with AI', emoji: '🪄', category: 'Cards & wishes',
    blurb: 'Describe the occasion and let AI design the whole card.',
    steps: [
      'Open “Describe with AI”.',
      'Type what you want — e.g. “Eco-friendly Ganesh Chaturthi card in Marathi”.',
      'Tap “Design card with AI” — it picks the palette, motifs and wording.',
      'Tap “Design again” for a new look, then open it to edit or share.',
    ],
  },
  {
    id: 'photo-art', tool: 'photoart', title: 'Turn a photo into a sketch or cartoon', emoji: '🎨', category: 'Family & photos',
    blurb: 'Free art filters — sketch, cartoon, painting — right on your device.',
    steps: [
      'Open the “Photo Art” tool.',
      'Choose a photo from your device.',
      'Tap a style in the grid — the preview updates to your photo.',
      'Save the picture or share it straight to WhatsApp.',
    ],
    video: { kind: 'file', src: 'photo-art.webm' }, durationSec: 18,
  },
  {
    id: 'family-portrait', tool: 'family', title: 'Make a family portrait together', emoji: '👨‍👩‍👧‍👦', category: 'Family & photos',
    blurb: 'Everyone adds one photo from their own phone; the family votes.',
    steps: [
      'Open “Family portrait” and pick an occasion theme.',
      'Add each person by name; tap “Invite family (live)” to get a link.',
      'Send the link on WhatsApp — everyone adds their own photo from their phone.',
      'Kids pick costumes, everyone votes ❤️, then save it as the group DP.',
    ],
    video: { kind: 'file', src: 'family-portrait.webm' }, durationSec: 19,
  },
  {
    id: 'reminders', tool: 'reminders', title: 'Never miss a birthday or festival', emoji: '🔔', category: 'Getting started',
    blurb: 'Save the dates you care about and get a nudge on the day.',
    steps: [
      'Open Reminders and add birthdays, anniversaries and milestones.',
      'Festivals like Diwali and Eid are tracked automatically.',
      'Turn on notifications to get a heads-up the day before.',
      'On the day, a ready card greets you — tap to personalise and send.',
    ],
    video: { kind: 'file', src: 'reminders.webm' }, durationSec: 17,
  },
  {
    id: 'make-a-reel', tool: 'reel', title: 'Make a reel from your video', emoji: '🎬', category: 'Video & reels',
    blurb: 'Add text, music, a voice-over and export for Reels or Status.',
    steps: [
      'Tap “Make a reel” and upload your video.',
      'Add captions, stickers and a music track.',
      'Record a voice-over if you like, and set a cover.',
      'Export for Instagram Reels, Shorts, TikTok or WhatsApp Status.',
    ],
  },
  {
    id: 'edit-pdf', tool: 'pdf', title: 'Work with PDFs — merge, protect, sign', emoji: '📄', category: 'PDF & docs',
    blurb: 'Combine, compress, password-protect and sign PDFs on your device.',
    steps: [
      'Every PDF tool is here — combine, compress, protect, sign.',
      'Open “Compress files” to shrink a big PDF or photo for sharing.',
      'Or add a password with Protect PDF to keep it private.',
      'Everything happens in your browser — the file never leaves.',
    ],
    video: { kind: 'file', src: 'edit-pdf.webm' }, durationSec: 18,
  },
];

/** Build a safe, privacy-friendly embed URL for a video source, or a direct
 *  file path. YouTube uses the no-cookie host; local files serve from
 *  /tutorials/. Returns null if the source is malformed. */
export function videoEmbedUrl(v: VideoSource): { kind: 'iframe' | 'file'; url: string; poster?: string } | null {
  if (v.kind === 'file') {
    // Basename only + safe chars — no path traversal, no separators.
    const name = (v.src.split(/[\\/]/).pop() ?? '').replace(/[^\w.-]/g, '');
    if (!name) return null;
    // A poster (first-frame preview) sits alongside as <name>.png, so the player
    // shows a thumbnail + play button instead of a black box before playback.
    const poster = '/tutorials/' + name.replace(/\.[^.]+$/, '') + '.png';
    return { kind: 'file', url: '/tutorials/' + name, poster };
  }
  if (v.kind === 'youtube') {
    return /^[\w-]{6,}$/.test(v.id) ? { kind: 'iframe', url: `https://www.youtube-nocookie.com/embed/${v.id}?rel=0` } : null;
  }
  if (v.kind === 'vimeo') {
    return /^\d{5,}$/.test(v.id) ? { kind: 'iframe', url: `https://player.vimeo.com/video/${v.id}` } : null;
  }
  return null;
}

/** mm:ss for a duration in seconds (e.g. 150 → "2:30"). */
export function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Search tutorials by free text (title/blurb/tool) and/or category. */
export function findTutorials(query = '', category?: TutorialCategory): Tutorial[] {
  const q = query.trim().toLowerCase();
  return TUTORIALS.filter((t) => {
    if (category && t.category !== category) return false;
    if (!q) return true;
    return (`${t.title} ${t.blurb} ${t.tool} ${t.category}`).toLowerCase().includes(q);
  });
}

/** The tutorial that teaches a given tool (for a "Watch how" deep-link). */
export const tutorialForTool = (tool: string): Tutorial | undefined => TUTORIALS.find((t) => t.tool === tool);
