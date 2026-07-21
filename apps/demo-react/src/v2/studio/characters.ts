/**
 * Curated on-device illustrated characters (girl / boy) for the animated wishes.
 *
 * These are flat vector figures drawn straight onto the greeting canvas — no
 * image assets, no network, no async decode — so they animate frame-exact in
 * both the live preview and the export, and stay crisp at any size. Each figure
 * is authored in a local unit space (the character is `size` tall, centred at
 * (cx, cy)), with one arm that waves, so a birthday/rakhi/friendship scene reads
 * as "a real person is celebrating for you" rather than an emoji.
 */

export interface CharacterStyle { skin: string; hair: string; outfit: string; outfit2: string; cheek: string; /** Gold-ish trim: saree border, kurta placket, bangles, bindi. */ trim?: string }

/** A few tasteful palettes so a scene can show visibly different people.
 *  Indian-attire scenes read best in festive jewel tones with a gold trim. */
export const CHARACTER_STYLES: Record<string, CharacterStyle> = {
  girl: { skin: '#f2c39b', hair: '#3a2417', outfit: '#f472b6', outfit2: '#db2777', cheek: '#f9a8d4', trim: '#fcd34d' },
  girl2: { skin: '#e8b48a', hair: '#1f2937', outfit: '#a78bfa', outfit2: '#7c3aed', cheek: '#f0abfc', trim: '#fcd34d' },
  boy: { skin: '#f0c19a', hair: '#241a12', outfit: '#38bdf8', outfit2: '#0284c7', cheek: '#fca5a5', trim: '#fcd34d' },
  boy2: { skin: '#d99b6c', hair: '#111827', outfit: '#34d399', outfit2: '#059669', cheek: '#fca5a5', trim: '#fcd34d' },
  // Festive Indian palettes — deep reds/greens with gold, as worn at weddings,
  // Diwali and Navratri.
  girlFestive: { skin: '#e8b48a', hair: '#1b1410', outfit: '#e11d48', outfit2: '#9f1239', cheek: '#fb7185', trim: '#fcd34d' },
  girlFestive2: { skin: '#d99b6c', hair: '#120d0a', outfit: '#7c3aed', outfit2: '#5b21b6', cheek: '#f0abfc', trim: '#fcd34d' },
  boyFestive: { skin: '#e8b48a', hair: '#1b1410', outfit: '#f8fafc', outfit2: '#c2410c', cheek: '#fca5a5', trim: '#fcd34d' },
  boyFestive2: { skin: '#d99b6c', hair: '#120d0a', outfit: '#fde68a', outfit2: '#b45309', cheek: '#fca5a5', trim: '#fcd34d' },
};

export type CharacterType = 'girl' | 'boy';
/** Clothing style. `indian` draws saree/lehenga + dupatta + bindi for a girl,
 *  and a kurta with a Nehru collar over churidar for a boy. */
export type Attire = 'western' | 'indian';

export interface DrawCharacterOpts {
  x: number; y: number; size: number; t: number;
  type?: CharacterType;
  style?: CharacterStyle;
  /** Clothing style (default 'western'). */
  attire?: Attire;
  /** Wave the raised arm (default true). */
  wave?: boolean;
  /** Entrance progress 0→1 already applied by the caller for pop-in (default 1). */
  reveal?: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw one illustrated character. Centre (x,y) is the middle of the figure;
 *  it spans `size` vertically. Pure canvas 2D — safe in preview and export. */
export function drawCharacter(ctx: CanvasRenderingContext2D, o: DrawCharacterOpts) {
  const type = o.type ?? 'girl';
  const st = o.style ?? CHARACTER_STYLES[type]!;
  const indian = (o.attire ?? 'western') === 'indian';
  const trim = st.trim ?? '#fcd34d';
  const reveal = o.reveal ?? 1;
  if (reveal <= 0) return;
  const S = o.size;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(reveal, reveal);
  // Gentle idle bob.
  ctx.translate(0, Math.sin(o.t * 3) * S * 0.01);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  const outfitTop = -S * 0.14;  // shoulders
  const hipY = S * 0.14;
  const footY = S * 0.46;
  const armW = S * 0.075;

  // ── Legs (churidar/pyjama in Indian attire; a girl's lehenga covers hers) ──
  ctx.fillStyle = indian && type === 'boy' ? st.outfit2 : st.skin;
  roundRect(ctx, -S * 0.11, hipY, S * 0.09, footY - hipY, S * 0.045); ctx.fill();
  roundRect(ctx, S * 0.02, hipY, S * 0.09, footY - hipY, S * 0.045); ctx.fill();
  // Shoes (juti/mojari-ish in Indian attire)
  ctx.fillStyle = indian ? trim : st.outfit2;
  roundRect(ctx, -S * 0.13, footY - S * 0.02, S * 0.13, S * 0.05, S * 0.02); ctx.fill();
  roundRect(ctx, S * 0.0, footY - S * 0.02, S * 0.13, S * 0.05, S * 0.02); ctx.fill();

  // ── Back arm (static, slightly out) ──
  ctx.strokeStyle = st.skin; ctx.lineWidth = armW;
  ctx.beginPath(); ctx.moveTo(-S * 0.11, outfitTop + S * 0.03); ctx.lineTo(-S * 0.2, outfitTop + S * 0.16); ctx.stroke();

  // ── Body / outfit ──
  ctx.fillStyle = st.outfit;
  if (type === 'girl' && indian) {
    // ── Lehenga / saree: fitted blouse, long flared skirt to the ankles, a
    //    dupatta draped over one shoulder, and a gold border at the hem. ──
    roundRect(ctx, -S * 0.13, outfitTop, S * 0.26, S * 0.17, S * 0.04); ctx.fill(); // choli
    ctx.fillStyle = st.outfit2;                                                      // skirt
    ctx.beginPath();
    ctx.moveTo(-S * 0.13, hipY - S * 0.03);
    ctx.lineTo(S * 0.13, hipY - S * 0.03);
    ctx.lineTo(S * 0.25, footY - S * 0.015);
    ctx.lineTo(-S * 0.25, footY - S * 0.015);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim;                                                            // gold hem
    roundRect(ctx, -S * 0.25, footY - S * 0.045, S * 0.5, S * 0.032, S * 0.014); ctx.fill();
    // Dupatta: a sash from the left shoulder across to the right hip.
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-S * 0.13, outfitTop + S * 0.01);
    ctx.lineTo(-S * 0.05, outfitTop);
    ctx.lineTo(S * 0.15, hipY - S * 0.02);
    ctx.lineTo(S * 0.06, hipY + S * 0.01);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (type === 'girl') {
    // A-line dress.
    ctx.beginPath();
    ctx.moveTo(-S * 0.13, outfitTop);
    ctx.lineTo(S * 0.13, outfitTop);
    ctx.lineTo(S * 0.2, hipY + S * 0.04);
    ctx.lineTo(-S * 0.2, hipY + S * 0.04);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = st.outfit2; // hem band
    roundRect(ctx, -S * 0.2, hipY - S * 0.01, S * 0.4, S * 0.05, S * 0.02); ctx.fill();
  } else if (indian) {
    // ── Kurta: a longer tunic past the hips, Nehru collar and gold placket. ──
    roundRect(ctx, -S * 0.145, outfitTop, S * 0.29, S * 0.34, S * 0.05); ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-S * 0.008, outfitTop + S * 0.03, S * 0.016, S * 0.16);   // placket
    roundRect(ctx, -S * 0.05, outfitTop - S * 0.012, S * 0.1, S * 0.035, S * 0.012); ctx.fill(); // collar
  } else {
    // Shirt + shorts.
    roundRect(ctx, -S * 0.14, outfitTop, S * 0.28, S * 0.22, S * 0.05); ctx.fill();
    ctx.fillStyle = st.outfit2;
    roundRect(ctx, -S * 0.13, hipY - S * 0.02, S * 0.26, S * 0.08, S * 0.03); ctx.fill();
  }

  // ── Head ──
  const headR = S * 0.15, headY = -S * 0.28;
  // Hair back (girl: long).
  ctx.fillStyle = st.hair;
  if (type === 'girl') { ctx.beginPath(); ctx.ellipse(0, headY + S * 0.02, headR * 1.15, headR * 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = st.skin;
  ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
  // Hair top cap.
  ctx.fillStyle = st.hair;
  ctx.beginPath(); ctx.arc(0, headY, headR * 1.04, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(-headR * 1.04, headY - headR * 0.1, headR * 2.08, headR * 0.3);
  if (type === 'girl' && indian) {
    // Braid over one shoulder, tied with a gold band, plus a flower in the hair.
    ctx.fillStyle = st.hair;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, headY + headR * 0.35);
    ctx.quadraticCurveTo(-headR * 1.5, headY + headR * 1.6, -headR * 0.95, headY + headR * 2.5);
    ctx.lineTo(-headR * 0.55, headY + headR * 2.4);
    ctx.quadraticCurveTo(-headR * 1.05, headY + headR * 1.5, -headR * 0.5, headY + headR * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.arc(-headR * 0.78, headY + headR * 2.45, headR * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fb7185'; // flower tucked above the ear
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(headR * 0.92 + Math.cos(a) * headR * 0.14, headY - headR * 0.62 + Math.sin(a) * headR * 0.14, headR * 0.11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.arc(headR * 0.92, headY - headR * 0.62, headR * 0.08, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'girl') {
    // Bow.
    ctx.fillStyle = st.outfit2;
    ctx.beginPath(); ctx.moveTo(headR * 0.7, headY - headR * 0.8); ctx.lineTo(headR * 1.3, headY - headR * 1.1); ctx.lineTo(headR * 1.3, headY - headR * 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(headR * 0.7, headY - headR * 0.8, headR * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  // Bindi — a small dot on the forehead (Indian attire only).
  if (indian && type === 'girl') {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(0, headY - headR * 0.52, headR * 0.09, 0, Math.PI * 2); ctx.fill();
  }
  // Cheeks.
  ctx.fillStyle = st.cheek; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(-headR * 0.45, headY + headR * 0.25, headR * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headR * 0.45, headY + headR * 0.25, headR * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Eyes + smile.
  ctx.fillStyle = '#1f2937';
  ctx.beginPath(); ctx.arc(-headR * 0.38, headY, headR * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headR * 0.38, headY, headR * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(1.5, S * 0.012);
  ctx.beginPath(); ctx.arc(0, headY + headR * 0.15, headR * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

  // ── Waving front arm (rotates around the shoulder) ──
  const wave = o.wave === false ? 0 : Math.sin(o.t * 6) * 0.35;
  ctx.save();
  ctx.translate(S * 0.12, outfitTop + S * 0.02);
  ctx.rotate(-0.9 + wave);
  ctx.strokeStyle = st.skin; ctx.lineWidth = armW; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S * 0.18, 0); ctx.stroke();
  ctx.fillStyle = st.skin; ctx.beginPath(); ctx.arc(S * 0.2, 0, armW * 0.7, 0, Math.PI * 2); ctx.fill();
  if (indian) { // gold bangles at the wrist
    ctx.strokeStyle = trim; ctx.lineWidth = Math.max(1.5, S * 0.012);
    ctx.beginPath(); ctx.moveTo(S * 0.15, -armW * 0.5); ctx.lineTo(S * 0.15, armW * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S * 0.17, -armW * 0.5); ctx.lineTo(S * 0.17, armW * 0.5); ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}
