/**
 * Regional-language cards — greeting & festival cards written in India's major
 * languages, in the regional script, with the right script font. Universal
 * moments (birthday, anniversary, thank you, Diwali, New Year) are offered in
 * all 12 Indian languages; region-specific festivals (Pongal, Onam, Ugadi,
 * Bihu, Poila Boishakh, Baisakhi, Gudi Padwa, Eid, Holi…) are offered in the
 * language(s) where they're celebrated. Each card is tagged with its `lang` so
 * the gallery can surface "cards in your language" automatically.
 *
 * Fonts fall back through Noto → OS Indic fonts (Nirmala UI / platform), which
 * every Indian phone ships, so the scripts render correctly without loading any
 * webfont.
 */
import { newElId, type Design, type Element, type TextEl } from './model.js';

export interface RegionalCard { id: string; name: string; emoji: string; occasion: string; lang: string; make: () => Design }

const W = 1500, H = 2100;
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Script-correct font stack per language (Noto → OS Indic font fallback). */
export const SCRIPT_FONT: Record<string, string> = {
  hi: '"Noto Sans Devanagari","Nirmala UI","Mangal",sans-serif',
  mr: '"Noto Sans Devanagari","Nirmala UI","Mangal",sans-serif',
  bn: '"Noto Sans Bengali","Nirmala UI","Vrinda",sans-serif',
  as: '"Noto Sans Bengali","Nirmala UI","Vrinda",sans-serif',
  ta: '"Noto Sans Tamil","Nirmala UI","Latha",sans-serif',
  te: '"Noto Sans Telugu","Nirmala UI","Gautami",sans-serif',
  kn: '"Noto Sans Kannada","Nirmala UI","Tunga",sans-serif',
  ml: '"Noto Sans Malayalam","Nirmala UI","Kartika",sans-serif',
  gu: '"Noto Sans Gujarati","Nirmala UI","Shruti",sans-serif',
  pa: '"Noto Sans Gurmukhi","Nirmala UI","Raavi",sans-serif',
  or: '"Noto Sans Oriya","Nirmala UI","Kalinga",sans-serif',
  ur: '"Noto Nastaliq Urdu","Jameel Noori Nastaleeq",serif',
};
export const LANG_NATIVE: Record<string, string> = {
  hi: 'हिन्दी', mr: 'मराठी', bn: 'বাংলা', as: 'অসমীয়া', ta: 'தமிழ்', te: 'తెలుగు',
  kn: 'ಕನ್ನಡ', ml: 'മലയാളം', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ', or: 'ଓଡ଼ିଆ', ur: 'اردو',
};
/** Languages that have regional cards, for the gallery's "cards in your
 *  language" picker (independent of the app UI language — an English-UI
 *  Marathi speaker should still find मराठी cards). */
export const CARD_LANGS: { code: string; native: string }[] =
  Object.entries(LANG_NATIVE).map(([code, native]) => ({ code, native }));

const text = (o: Partial<TextEl> & { x: number; y: number; w: number; h: number; text: string }): TextEl => ({
  id: newElId(), type: 'text', size: 48, color: '#0f172a', font: 'Inter, sans-serif', weight: 700, align: 'center', rotation: 0, ...o,
});
const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'rect', x, y, w, h, fill, ...extra } as Element);
const ellipse = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<Element> = {}): Element => ({ id: newElId(), type: 'ellipse', x, y, w, h, fill, ...extra } as Element);
const emoji = (x: number, y: number, size: number, ch: string, rot = 0, opacity = 1): TextEl =>
  text({ x, y, w: size * 1.4, h: size * 1.4, text: ch, size, font: EMO, rotation: rot, opacity });

interface Theme { bg: string; ink: string; accent: string; soft: string }

/** Balance a long title across two lines at the most even word break, so long
 *  Indic greetings (Tamil/Malayalam) don't overflow the card width. */
function wrapTitle(s: string): string {
  if (s.length <= 13) return s;
  const parts = s.split(' ');
  if (parts.length < 2) return s;
  let best = s, bestDiff = Infinity;
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join(' '), b = parts.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < bestDiff) { bestDiff = d; best = a + '\n' + b; }
  }
  return best;
}

/** One festive layout, filled with regional-script text. A glowing halo behind
 *  a large regional title, festival emojis in the corners, a subtitle below. */
function festiveCard(title: string, sub: string, font: string, th: Theme, emojis: string[]): Design {
  const rtl = font.includes('Nastaliq');
  const wrapped = wrapTitle(title);
  const maxLine = Math.max(...wrapped.split('\n').map((l) => l.length));
  const size = maxLine <= 11 ? 172 : maxLine <= 16 ? 138 : maxLine <= 22 ? 112 : 92;
  const lines = wrapped.includes('\n') ? 2 : 1;
  const titleY = 900 - (lines * size) / 2;
  return {
    w: W, h: H, background: th.bg,
    elements: [
      rect(70, 70, W - 140, H - 140, 'none', { stroke: th.accent, strokeWidth: 3, radius: 22 }),
      ellipse(W / 2 - 560, 300, 1120, 1120, th.soft, { opacity: 0.55 }),
      emoji(150, 250, 120, emojis[0] ?? '✨', -12), emoji(1180, 260, 120, emojis[1] ?? '✨', 12),
      emoji(160, 1560, 120, emojis[2] ?? emojis[0] ?? '✨', 10), emoji(1180, 1560, 120, emojis[3] ?? emojis[1] ?? '✨', -10),
      text({ x: 120, y: titleY, w: 1260, h: 560, text: wrapped, size, color: th.accent, weight: 800, font, align: rtl ? 'right' : 'center' }),
      ...(sub ? [text({ x: 160, y: 1470, w: 1180, h: 220, text: sub, size: 66, color: th.ink, weight: 600, font, align: rtl ? 'right' : 'center' })] : []),
    ],
  };
}

// Palettes by mood.
const P = {
  festival: { bg: '#160a2e', ink: '#fde68a', accent: '#f59e0b', soft: '#3b1d5e' },
  gold: { bg: '#0f1020', ink: '#fde68a', accent: '#facc15', soft: '#2a2140' },
  rose: { bg: '#4a0519', ink: '#fecdd3', accent: '#fb7185', soft: '#7a1533' },
  green: { bg: '#052e1a', ink: '#dcfce7', accent: '#4ade80', soft: '#0b4a2c' },
  sky: { bg: '#082f49', ink: '#e0f2fe', accent: '#38bdf8', soft: '#0c4a6e' },
  saffron: { bg: '#2a1005', ink: '#ffedd5', accent: '#fb923c', soft: '#5c2c0e' },
  pink: { bg: '#500724', ink: '#fbcfe8', accent: '#f472b6', soft: '#831843' },
} as const;

/** A greeting = one occasion with per-language script text. */
interface Greeting { key: string; occasion: string; emoji: string; emojis: string[]; theme: Theme; text: Record<string, { t: string; s?: string }> }

const GREETINGS: Greeting[] = [
  { key: 'birthday', occasion: 'Birthday', emoji: '🎂', emojis: ['🎂', '🎈', '🎉', '✨'], theme: P.pink, text: {
    hi: { t: 'जन्मदिन मुबारक', s: 'खूब सारी खुशियाँ' }, mr: { t: 'वाढदिवसाच्या हार्दिक शुभेच्छा' }, bn: { t: 'শুভ জন্মদিন', s: 'অনেক শুভেচ্ছা' }, as: { t: 'জন্মদিনৰ শুভেচ্ছা' },
    ta: { t: 'பிறந்தநாள் வாழ்த்துக்கள்' }, te: { t: 'పుట్టినరోజు శుభాకాంక్షలు' }, kn: { t: 'ಹುಟ್ಟುಹಬ್ಬದ ಶುಭಾಶಯಗಳು' }, ml: { t: 'ജന്മദിന ആശംസകൾ' },
    gu: { t: 'જન્મદિવસની શુભકામનાઓ' }, pa: { t: 'ਜਨਮਦਿਨ ਮੁਬਾਰਕ' }, or: { t: 'ଜନ୍ମଦିନର ଶୁଭେଚ୍ଛା' }, ur: { t: 'سالگرہ مبارک' } } },
  { key: 'anniversary', occasion: 'Anniversary', emoji: '💞', emojis: ['💞', '❤️', '🌹', '✨'], theme: P.rose, text: {
    hi: { t: 'सालगिरह मुबारक' }, mr: { t: 'लग्नाच्या वाढदिवसाच्या शुभेच्छा' }, bn: { t: 'শুভ বিবাহবার্ষিকী' }, as: { t: 'বিবাহবাৰ্ষিকীৰ শুভেচ্ছা' },
    ta: { t: 'திருமண நாள் வாழ்த்துக்கள்' }, te: { t: 'వివాహ వార్షికోత్సవ శుభాకాంక్షలు' }, kn: { t: 'ವಿವಾಹ ವಾರ್ಷಿಕೋತ್ಸವದ ಶುಭಾಶಯಗಳು' }, ml: { t: 'വിവാഹവാർഷിക ആശംസകൾ' },
    gu: { t: 'લગ્નજયંતિની શુભકામનાઓ' }, pa: { t: 'ਵਿਆਹ ਦੀ ਵਰ੍ਹੇਗੰਢ ਮੁਬਾਰਕ' }, or: { t: 'ବିବାହ ବାର୍ଷିକୀର ଶୁଭେଚ୍ଛା' }, ur: { t: 'شادی کی سالگرہ مبارک' } } },
  { key: 'thankyou', occasion: 'Thank You', emoji: '🙏', emojis: ['💐', '🌿', '✨', '🙏'], theme: P.green, text: {
    hi: { t: 'धन्यवाद', s: 'हृदय से आभार' }, mr: { t: 'धन्यवाद' }, bn: { t: 'ধন্যবাদ' }, as: { t: 'ধন্যবাদ' },
    ta: { t: 'நன்றி' }, te: { t: 'ధన్యవాదాలు' }, kn: { t: 'ಧನ್ಯವಾದಗಳು' }, ml: { t: 'നന്ദി' },
    gu: { t: 'આભાર' }, pa: { t: 'ਧੰਨਵਾਦ' }, or: { t: 'ଧନ୍ୟବାଦ' }, ur: { t: 'شکریہ' } } },
  { key: 'diwali', occasion: 'Festivals', emoji: '🪔', emojis: ['🪔', '🎆', '✨', '🏵️'], theme: P.festival, text: {
    hi: { t: 'दीपावली की शुभकामनाएँ' }, mr: { t: 'दिवाळीच्या हार्दिक शुभेच्छा' }, bn: { t: 'শুভ দীপাবলি' }, as: { t: 'দীপাৱলীৰ শুভেচ্ছা' },
    ta: { t: 'தீபாவளி நல்வாழ்த்துக்கள்' }, te: { t: 'దీపావళి శుభాకాంక్షలు' }, kn: { t: 'ದೀಪಾವಳಿ ಶುಭಾಶಯಗಳು' }, ml: { t: 'ദീപാവലി ആശംസകൾ' },
    gu: { t: 'દિવાળીની શુભકામનાઓ' }, pa: { t: 'ਦੀਵਾਲੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ' }, or: { t: 'ଦୀପାବଳୀର ଶୁଭେଚ୍ଛା' }, ur: { t: 'دیوالی مبارک' } } },
  { key: 'newyear', occasion: 'Seasonal', emoji: '🎆', emojis: ['🎆', '🥂', '✨', '🎉'], theme: P.gold, text: {
    hi: { t: 'नववर्ष की शुभकामनाएँ' }, mr: { t: 'नववर्षाच्या शुभेच्छा' }, bn: { t: 'শুভ নববর্ষ' }, as: { t: 'নতুন বছৰৰ শুভেচ্ছা' },
    ta: { t: 'புத்தாண்டு வாழ்த்துக்கள்' }, te: { t: 'నూతన సంవత్సర శుభాకాంక్షలు' }, kn: { t: 'ಹೊಸ ವರ್ಷದ ಶುಭಾಶಯಗಳು' }, ml: { t: 'പുതുവത്സരാശംസകൾ' },
    gu: { t: 'નૂતન વર્ષની શુભકામનાઓ' }, pa: { t: 'ਨਵੇਂ ਸਾਲ ਦੀਆਂ ਮੁਬਾਰਕਾਂ' }, or: { t: 'ନୂତନ ବର୍ଷର ଶୁଭେଚ୍ଛା' }, ur: { t: 'نیا سال مبارک' } } },
  // ── Region-specific festivals (in the languages where they're celebrated) ──
  { key: 'eid', occasion: 'Festivals', emoji: '🌙', emojis: ['🌙', '🕌', '✨', '🏮'], theme: P.sky, text: {
    ur: { t: 'عید مبارک' }, hi: { t: 'ईद मुबारक' }, bn: { t: 'ঈদ মোবারক' }, ml: { t: 'ഈദ് മുബാറക്' }, kn: { t: 'ಈದ್ ಮುಬಾರಕ್' } } },
  { key: 'holi', occasion: 'Festivals', emoji: '🎨', emojis: ['🎨', '🌈', '✨', '💜'], theme: P.pink, text: {
    hi: { t: 'होली की शुभकामनाएँ' }, mr: { t: 'होळीच्या हार्दिक शुभेच्छा' }, gu: { t: 'હોળીની શુભકામનાઓ' }, bn: { t: 'শুভ দোলযাত্রা' } } },
  { key: 'raksha', occasion: 'Festivals', emoji: '🪢', emojis: ['🪢', '🎀', '✨', '🌸'], theme: P.saffron, text: {
    hi: { t: 'रक्षाबंधन की शुभकामनाएँ' }, mr: { t: 'रक्षाबंधनाच्या शुभेच्छा' }, gu: { t: 'રક્ષાબંધનની શુભકામનાઓ' } } },
  { key: 'pongal', occasion: 'Festivals', emoji: '🌾', emojis: ['🌾', '🍚', '☀️', '🐄'], theme: P.saffron, text: {
    ta: { t: 'இனிய பொங்கல் நல்வாழ்த்துக்கள்' } } },
  { key: 'onam', occasion: 'Festivals', emoji: '🌸', emojis: ['🌸', '🚣', '🌼', '✨'], theme: P.green, text: {
    ml: { t: 'ഹൃദയം നിറഞ്ഞ ഓണാശംസകൾ' } } },
  { key: 'ugadi', occasion: 'Festivals', emoji: '🌿', emojis: ['🌿', '🥭', '✨', '🌼'], theme: P.green, text: {
    kn: { t: 'ಯುಗಾದಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು' }, te: { t: 'ఉగాది శుభాకాంక్షలు' }, hi: { t: 'उगादी की शुभकामनाएँ' } } },
  { key: 'bihu', occasion: 'Festivals', emoji: '🥁', emojis: ['🌾', '🥁', '✨', '🪭'], theme: P.saffron, text: {
    as: { t: 'ৰঙালী বিহুৰ শুভেচ্ছা' } } },
  { key: 'poila', occasion: 'Festivals', emoji: '🎊', emojis: ['🎊', '🌼', '✨', '🎉'], theme: P.gold, text: {
    bn: { t: 'শুভ নববর্ষ', s: 'শুভ পয়লা বৈশাখ' } } },
  { key: 'baisakhi', occasion: 'Festivals', emoji: '🥁', emojis: ['🌾', '🥁', '✨', '🎉'], theme: P.saffron, text: {
    pa: { t: 'ਵਿਸਾਖੀ ਦੀਆਂ ਮੁਬਾਰਕਾਂ' } } },
  { key: 'gudipadwa', occasion: 'Festivals', emoji: '🚩', emojis: ['🚩', '🌿', '✨', '🥭'], theme: P.saffron, text: {
    mr: { t: 'गुढी पाडव्याच्या हार्दिक शुभेच्छा' } } },
  { key: 'ganesh', occasion: 'Festivals', emoji: '🕉️', emojis: ['🕉️', '🌺', '🪔', '✨'], theme: P.festival, text: {
    mr: { t: 'गणपती बाप्पा मोरया' }, hi: { t: 'गणेश चतुर्थी की शुभकामनाएँ' }, te: { t: 'వినాయక చవితి శుభాకాంక్షలు' } } },
  { key: 'durga', occasion: 'Festivals', emoji: '🌺', emojis: ['🌺', '🥁', '🪔', '✨'], theme: P.rose, text: {
    bn: { t: 'শুভ দুর্গা পূজা', s: 'মা আসছেন' }, as: { t: 'দুৰ্গা পূজাৰ শুভেচ্ছা' }, hi: { t: 'दुर्गा पूजा की शुभकामनाएँ' }, or: { t: 'ଦୁର୍ଗା ପୂଜାର ଶୁଭେଚ୍ଛା' } } },
  { key: 'navratri', occasion: 'Festivals', emoji: '🪘', emojis: ['🪘', '🪔', '🌺', '✨'], theme: P.festival, text: {
    gu: { t: 'નવરાત્રિની શુભકામનાઓ', s: 'ગરબાની રમઝટ' }, hi: { t: 'नवरात्रि की शुभकामनाएँ' } } },
  { key: 'chhath', occasion: 'Festivals', emoji: '🌅', emojis: ['🌅', '🧺', '🥥', '🪔'], theme: P.saffron, text: {
    hi: { t: 'छठ पूजा की शुभकामनाएँ', s: 'जय छठी मईया' } } },
];

/** Generated regional cards, one per (greeting × language). */
export const REGIONAL_CARDS: RegionalCard[] = GREETINGS.flatMap((g) =>
  Object.entries(g.text).map(([lang, v]) => ({
    id: `rg-${g.key}-${lang}`,
    name: `${g.key[0]!.toUpperCase()}${g.key.slice(1)} — ${LANG_NATIVE[lang] ?? lang}`,
    emoji: g.emoji, occasion: g.occasion, lang,
    make: () => festiveCard(v.t, v.s ?? '', SCRIPT_FONT[lang] ?? 'sans-serif', g.theme, g.emojis),
  })),
);
