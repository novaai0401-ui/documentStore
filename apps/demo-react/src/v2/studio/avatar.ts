/**
 * Avatar builder — composes a flat-style character portrait from layered SVG
 * primitives (face, hair, eyes, mouth, facial hair, glasses, headwear) chosen
 * from enumerable options. Output is a single self-contained SVG string that
 * drops onto a design as a `contain` image element, so it scales crisply and
 * exports cleanly like any other clipart. Pure & deterministic (pass your own
 * RNG to `randomAvatar` for reproducibility), so it's fully unit-testable.
 */

export interface AvatarOptions {
  bg: string;
  skin: string;
  face: 'round' | 'oval' | 'square';
  hair: 'bald' | 'short' | 'buzz' | 'curly' | 'long' | 'bun' | 'ponytail';
  hairColor: string;
  eyes: 'dots' | 'round' | 'happy' | 'wink';
  brows: 'default' | 'raised' | 'flat';
  mouth: 'smile' | 'grin' | 'neutral' | 'surprised';
  facialHair: 'none' | 'moustache' | 'beard' | 'stubble';
  glasses: 'none' | 'round' | 'square' | 'sun';
  headwear: 'none' | 'cap' | 'bow' | 'band' | 'flower';
}

interface Choice { id: string; label: string; swatch?: string }
interface Dimension { key: keyof AvatarOptions; label: string; choices: Choice[] }

export const SKIN_TONES: Choice[] = [
  { id: '#ffdfc4', label: 'Light', swatch: '#ffdfc4' },
  { id: '#f2c197', label: 'Fair', swatch: '#f2c197' },
  { id: '#e0ac69', label: 'Medium', swatch: '#e0ac69' },
  { id: '#c68642', label: 'Tan', swatch: '#c68642' },
  { id: '#8d5524', label: 'Brown', swatch: '#8d5524' },
  { id: '#5c3a21', label: 'Deep', swatch: '#5c3a21' },
];

export const HAIR_COLORS: Choice[] = [
  { id: '#1c1917', label: 'Black', swatch: '#1c1917' },
  { id: '#6b4423', label: 'Brown', swatch: '#6b4423' },
  { id: '#e0b04a', label: 'Blonde', swatch: '#e0b04a' },
  { id: '#a5522a', label: 'Auburn', swatch: '#a5522a' },
  { id: '#9ca3af', label: 'Grey', swatch: '#9ca3af' },
  { id: '#ec4899', label: 'Pink', swatch: '#ec4899' },
  { id: '#3b82f6', label: 'Blue', swatch: '#3b82f6' },
];

export const AVATAR_BACKGROUNDS: Choice[] = [
  { id: '#dbeafe', label: 'Sky', swatch: '#dbeafe' },
  { id: '#fce7f3', label: 'Pink', swatch: '#fce7f3' },
  { id: '#dcfce7', label: 'Mint', swatch: '#dcfce7' },
  { id: '#fef3c7', label: 'Butter', swatch: '#fef3c7' },
  { id: '#ede9fe', label: 'Lilac', swatch: '#ede9fe' },
  { id: '#cffafe', label: 'Aqua', swatch: '#cffafe' },
  { id: '#e2e8f0', label: 'Slate', swatch: '#e2e8f0' },
];

/** The pickable dimensions (for the builder UI), in display order. */
export const AVATAR_OPTIONS: Dimension[] = [
  { key: 'skin', label: 'Skin', choices: SKIN_TONES },
  { key: 'face', label: 'Face', choices: [{ id: 'round', label: 'Round' }, { id: 'oval', label: 'Oval' }, { id: 'square', label: 'Square' }] },
  { key: 'hair', label: 'Hair', choices: [{ id: 'short', label: 'Short' }, { id: 'buzz', label: 'Buzz' }, { id: 'curly', label: 'Curly' }, { id: 'long', label: 'Long' }, { id: 'bun', label: 'Bun' }, { id: 'ponytail', label: 'Ponytail' }, { id: 'bald', label: 'Bald' }] },
  { key: 'hairColor', label: 'Hair colour', choices: HAIR_COLORS },
  { key: 'eyes', label: 'Eyes', choices: [{ id: 'round', label: 'Round' }, { id: 'dots', label: 'Dots' }, { id: 'happy', label: 'Happy' }, { id: 'wink', label: 'Wink' }] },
  { key: 'brows', label: 'Brows', choices: [{ id: 'default', label: 'Default' }, { id: 'raised', label: 'Raised' }, { id: 'flat', label: 'Flat' }] },
  { key: 'mouth', label: 'Mouth', choices: [{ id: 'smile', label: 'Smile' }, { id: 'grin', label: 'Grin' }, { id: 'neutral', label: 'Neutral' }, { id: 'surprised', label: 'Surprised' }] },
  { key: 'facialHair', label: 'Facial hair', choices: [{ id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'moustache', label: 'Moustache' }, { id: 'beard', label: 'Beard' }] },
  { key: 'glasses', label: 'Glasses', choices: [{ id: 'none', label: 'None' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'sun', label: 'Sunglasses' }] },
  { key: 'headwear', label: 'Headwear', choices: [{ id: 'none', label: 'None' }, { id: 'band', label: 'Headband' }, { id: 'bow', label: 'Bow' }, { id: 'cap', label: 'Cap' }, { id: 'flower', label: 'Flower' }] },
  { key: 'bg', label: 'Background', choices: AVATAR_BACKGROUNDS },
];

export const DEFAULT_AVATAR: AvatarOptions = {
  bg: '#dbeafe', skin: '#f2c197', face: 'round', hair: 'short', hairColor: '#1c1917',
  eyes: 'round', brows: 'default', mouth: 'smile', facialHair: 'none', glasses: 'none', headwear: 'none',
};

// Layout constants (200×200 canvas).
const CX = 100, CY = 104, HR = 50; // head centre + radius

/** Darken a #rrggbb by a factor for shadows/outlines. */
function shade(hex: string, f = 0.72): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function faceShape(skin: string, face: AvatarOptions['face']): string {
  const ear = `<circle cx="${CX - HR}" cy="${CY}" r="10" fill="${skin}"/><circle cx="${CX + HR}" cy="${CY}" r="10" fill="${skin}"/>`;
  const neck = `<rect x="${CX - 16}" y="${CY + HR - 14}" width="32" height="34" rx="12" fill="${shade(skin, 0.9)}"/>`;
  let head: string;
  if (face === 'oval') head = `<ellipse cx="${CX}" cy="${CY}" rx="${HR - 4}" ry="${HR + 6}" fill="${skin}"/>`;
  else if (face === 'square') head = `<rect x="${CX - HR + 4}" y="${CY - HR}" width="${(HR - 4) * 2}" height="${HR * 2}" rx="22" fill="${skin}"/>`;
  else head = `<circle cx="${CX}" cy="${CY}" r="${HR}" fill="${skin}"/>`;
  return neck + ear + head;
}

function hairShape(hair: AvatarOptions['hair'], c: string): { back: string; front: string } {
  if (hair === 'bald') return { back: '', front: '' };
  const cap = `<path d="M${CX - HR - 2} ${CY - 6} C${CX - HR} ${CY - HR - 34} ${CX + HR} ${CY - HR - 34} ${CX + HR + 2} ${CY - 6} C${CX + HR - 6} ${CY - HR + 6} ${CX + 20} ${CY - HR + 2} ${CX} ${CY - HR + 4} C${CX - 20} ${CY - HR + 2} ${CX - HR + 6} ${CY - HR + 6} ${CX - HR - 2} ${CY - 6}Z" fill="${c}"/>`;
  switch (hair) {
    case 'buzz':
      return { back: '', front: `<path d="M${CX - HR} ${CY - 10} C${CX - HR} ${CY - HR - 20} ${CX + HR} ${CY - HR - 20} ${CX + HR} ${CY - 10} C${CX + HR - 10} ${CY - HR + 4} ${CX - HR + 10} ${CY - HR + 4} ${CX - HR} ${CY - 10}Z" fill="${c}" opacity="0.92"/>` };
    case 'curly': {
      let curls = '';
      const pts: [number, number][] = [[CX - 44, CY - 34], [CX - 26, CY - 50], [CX, CY - 56], [CX + 26, CY - 50], [CX + 44, CY - 34], [CX - 48, CY - 12], [CX + 48, CY - 12]];
      for (const [x, y] of pts) curls += `<circle cx="${x}" cy="${y}" r="16" fill="${c}"/>`;
      return { back: '', front: curls };
    }
    case 'long':
      return { back: `<path d="M${CX - HR - 6} ${CY - 20} C${CX - HR - 12} ${CY + 46} ${CX - 30} ${CY + 60} ${CX} ${CY + 58} C${CX + 30} ${CY + 60} ${CX + HR + 12} ${CY + 46} ${CX + HR + 6} ${CY - 20}Z" fill="${c}"/>`, front: cap };
    case 'bun':
      return { back: `<circle cx="${CX}" cy="${CY - HR - 18}" r="16" fill="${c}"/>`, front: cap };
    case 'ponytail':
      return { back: `<path d="M${CX + HR - 6} ${CY - 26} C${CX + HR + 26} ${CY - 10} ${CX + HR + 30} ${CY + 30} ${CX + HR + 8} ${CY + 44} C${CX + HR + 20} ${CY + 10} ${CX + HR + 4} ${CY - 6} ${CX + HR - 10} ${CY - 6}Z" fill="${c}"/>`, front: cap };
    default: // short
      return { back: '', front: cap };
  }
}

function eyesShape(eyes: AvatarOptions['eyes']): string {
  const L = CX - 18, R = CX + 18, y = CY + 2;
  const white = (x: number) => `<circle cx="${x}" cy="${y}" r="9" fill="#fff"/><circle cx="${x}" cy="${y}" r="4.2" fill="#1f2937"/>`;
  switch (eyes) {
    case 'dots': return `<circle cx="${L}" cy="${y}" r="5" fill="#1f2937"/><circle cx="${R}" cy="${y}" r="5" fill="#1f2937"/>`;
    case 'happy': return `<path d="M${L - 9} ${y + 2} Q${L} ${y - 10} ${L + 9} ${y + 2}" fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/><path d="M${R - 9} ${y + 2} Q${R} ${y - 10} ${R + 9} ${y + 2}" fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/>`;
    case 'wink': return `${white(L)}<path d="M${R - 9} ${y} Q${R} ${y - 9} ${R + 9} ${y}" fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/>`;
    default: return white(L) + white(R);
  }
}

function browsShape(brows: AvatarOptions['brows'], c: string): string {
  const L = CX - 18, R = CX + 18, y = CY - 16;
  if (brows === 'raised') return `<path d="M${L - 9} ${y} Q${L} ${y - 8} ${L + 9} ${y - 2}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${R - 9} ${y - 2} Q${R} ${y - 8} ${R + 9} ${y}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if (brows === 'flat') return `<line x1="${L - 9}" y1="${y}" x2="${L + 9}" y2="${y}" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="${R - 9}" y1="${y}" x2="${R + 9}" y2="${y}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
  return `<path d="M${L - 9} ${y + 2} Q${L} ${y - 4} ${L + 9} ${y}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${R - 9} ${y} Q${R} ${y - 4} ${R + 9} ${y + 2}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
}

function mouthShape(mouth: AvatarOptions['mouth']): string {
  const y = CY + 28;
  switch (mouth) {
    case 'grin': return `<path d="M${CX - 16} ${y - 4} Q${CX} ${y + 16} ${CX + 16} ${y - 4}Z" fill="#b91c1c"/><path d="M${CX - 14} ${y - 3} H${CX + 14}" stroke="#fff" stroke-width="4"/>`;
    case 'neutral': return `<line x1="${CX - 12}" y1="${y}" x2="${CX + 12}" y2="${y}" stroke="#9d3b3b" stroke-width="4" stroke-linecap="round"/>`;
    case 'surprised': return `<ellipse cx="${CX}" cy="${y}" rx="8" ry="10" fill="#b91c1c"/>`;
    default: return `<path d="M${CX - 15} ${y - 2} Q${CX} ${y + 12} ${CX + 15} ${y - 2}" fill="none" stroke="#b5455a" stroke-width="5" stroke-linecap="round"/>`;
  }
}

function facialHairShape(f: AvatarOptions['facialHair'], c: string): string {
  const y = CY + 28;
  switch (f) {
    case 'moustache': return `<path d="M${CX - 16} ${y - 8} Q${CX} ${y - 2} ${CX} ${y - 6} Q${CX} ${y - 2} ${CX + 16} ${y - 8} Q${CX} ${y + 4} ${CX - 16} ${y - 8}Z" fill="${c}"/>`;
    case 'beard': return `<path d="M${CX - HR + 8} ${CY + 6} C${CX - HR + 6} ${CY + HR - 2} ${CX} ${CY + HR + 12} ${CX} ${CY + HR + 12} C${CX} ${CY + HR + 12} ${CX + HR - 6} ${CY + HR - 2} ${CX + HR - 8} ${CY + 6} C${CX + 20} ${CY + 26} ${CX - 20} ${CY + 26} ${CX - HR + 8} ${CY + 6}Z" fill="${c}"/>`;
    case 'stubble': return `<path d="M${CX - HR + 12} ${CY + 14} C${CX - HR + 12} ${CY + HR - 2} ${CX} ${CY + HR + 6} ${CX} ${CY + HR + 6} C${CX} ${CY + HR + 6} ${CX + HR - 12} ${CY + HR - 2} ${CX + HR - 12} ${CY + 14} C${CX + 16} ${CY + 30} ${CX - 16} ${CY + 30} ${CX - HR + 12} ${CY + 14}Z" fill="${c}" opacity="0.28"/>`;
    default: return '';
  }
}

function glassesShape(g: AvatarOptions['glasses']): string {
  const L = CX - 18, R = CX + 18, y = CY + 2;
  if (g === 'round') return `<g fill="none" stroke="#1f2937" stroke-width="3"><circle cx="${L}" cy="${y}" r="12"/><circle cx="${R}" cy="${y}" r="12"/><line x1="${L + 12}" y1="${y}" x2="${R - 12}" y2="${y}"/></g>`;
  if (g === 'square') return `<g fill="none" stroke="#1f2937" stroke-width="3"><rect x="${L - 12}" y="${y - 10}" width="24" height="20" rx="4"/><rect x="${R - 12}" y="${y - 10}" width="24" height="20" rx="4"/><line x1="${L + 12}" y1="${y}" x2="${R - 12}" y2="${y}"/></g>`;
  if (g === 'sun') return `<g stroke="#111827" stroke-width="3"><rect x="${L - 13}" y="${y - 10}" width="26" height="20" rx="9" fill="#111827"/><rect x="${R - 13}" y="${y - 10}" width="26" height="20" rx="9" fill="#111827"/><line x1="${L + 13}" y1="${y - 4}" x2="${R - 13}" y2="${y - 4}"/></g>`;
  return '';
}

function headwearShape(h: AvatarOptions['headwear']): string {
  switch (h) {
    case 'cap': return `<path d="M${CX - HR - 2} ${CY - HR + 8} C${CX - HR} ${CY - HR - 26} ${CX + HR} ${CY - HR - 26} ${CX + HR + 2} ${CY - HR + 8} Z" fill="#2563eb"/><path d="M${CX - HR - 2} ${CY - HR + 8} h${HR + 20} q10 0 12 8 h-${HR + 32}Z" fill="#1d4ed8"/><circle cx="${CX}" cy="${CY - HR - 20}" r="5" fill="#1d4ed8"/>`;
    case 'bow': return `<g fill="#ec4899"><path d="M${CX} ${CY - HR - 4} l-22 -12 v24Z"/><path d="M${CX} ${CY - HR - 4} l22 -12 v24Z"/><circle cx="${CX}" cy="${CY - HR - 4}" r="7" fill="#be185d"/></g>`;
    case 'band': return `<path d="M${CX - HR - 2} ${CY - HR + 12} C${CX - HR} ${CY - HR - 6} ${CX + HR} ${CY - HR - 6} ${CX + HR + 2} ${CY - HR + 12} Z" fill="#f59e0b"/>`;
    case 'flower': { const x = CX - HR + 6, y = CY - HR + 8; let p = ''; for (let i = 0; i < 6; i++) { const a = 60 * i; p += `<ellipse cx="${x}" cy="${y - 7}" rx="5" ry="9" fill="#f472b6" transform="rotate(${a} ${x} ${y})"/>`; } return p + `<circle cx="${x}" cy="${y}" r="5" fill="#fbbf24"/>`; }
    default: return '';
  }
}

/** Compose the full avatar SVG from the given options. */
export function buildAvatarSvg(o: AvatarOptions): string {
  const hair = hairShape(o.hair, o.hairColor);
  const body = [
    `<rect width="200" height="200" rx="28" fill="${o.bg}"/>`,
    hair.back,
    faceShape(o.skin, o.face),
    hair.front,
    browsShape(o.brows, o.hair === 'bald' ? '#4b5563' : o.hairColor),
    eyesShape(o.eyes),
    // simple nose
    `<path d="M${CX} ${CY + 8} q-4 8 0 12 q3 0 4 -2" fill="none" stroke="${shade(o.skin, 0.75)}" stroke-width="3" stroke-linecap="round"/>`,
    facialHairShape(o.facialHair, o.hairColor),
    mouthShape(o.mouth),
    glassesShape(o.glasses),
    headwearShape(o.headwear),
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${body}</svg>`;
}

const pick = <T,>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)]!;

/** A random-but-valid avatar. Pass a seeded RNG for reproducible output. */
export function randomAvatar(rand: () => number = Math.random): AvatarOptions {
  return {
    bg: pick(AVATAR_BACKGROUNDS, rand).id,
    skin: pick(SKIN_TONES, rand).id,
    face: pick(['round', 'oval', 'square'] as const, rand),
    hair: pick(['short', 'buzz', 'curly', 'long', 'bun', 'ponytail', 'bald'] as const, rand),
    hairColor: pick(HAIR_COLORS, rand).id,
    eyes: pick(['round', 'dots', 'happy', 'wink'] as const, rand),
    brows: pick(['default', 'raised', 'flat'] as const, rand),
    mouth: pick(['smile', 'grin', 'neutral', 'surprised'] as const, rand),
    facialHair: pick(['none', 'none', 'stubble', 'moustache', 'beard'] as const, rand),
    glasses: pick(['none', 'none', 'round', 'square', 'sun'] as const, rand),
    headwear: pick(['none', 'none', 'band', 'bow', 'cap', 'flower'] as const, rand),
  };
}
