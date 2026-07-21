/**
 * PDF text → PowerPoint (.pptx) — ours, hand-built OOXML. We assemble the full
 * required part chain (content types, presentation, slide master + layout +
 * theme, one slide per page) with our zip writer — no PowerPoint library. One
 * slide per page, each with the page's text as a body placeholder. Honest:
 * text reflowed into slides, not a visual copy of the PDF.
 */
import { zipStore } from './zip.js';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PML = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DML = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** A presentation theme — drives the slide background, text and accent colours. */
export interface PptxTheme { bg: string; fg: string; heading: string; accent: string }
// OOXML srgbClr wants a 6-hex string with no leading '#'; normalise + guard.
const hx = (c: string, fallback: string): string => {
  const h = (c || '').replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(h) ? h : fallback;
};

/** Bullet indent level from a body line's leading tabs (0–4). */
export function bulletLevel(line: string): number {
  const m = /^\t+/.exec(line);
  return m ? Math.min(4, m[0].length) : 0;
}

/** Slide layouts we lay out geometrically (mirrors the editor's preview). */
export type PptxLayout = 'titleContent' | 'title' | 'section' | 'imageRight' | 'blank';

// 4:3 slide is 9144000 × 6858000 EMU. Per-layout placeholder boxes, mirroring
// the on-screen preview so the exported deck matches what the user designed.
interface Box { x: number; y: number; cx: number; cy: number }
interface LayoutGeom { title: Box | null; body: Box; titleAnchor?: 'ctr' | 't'; titleAlign?: 'ctr' | 'l'; bodyAnchor?: 'ctr' | 't'; bodyAlign?: 'ctr' | 'l'; titleSz?: number; rule?: boolean }

function geomFor(layout: PptxLayout, hasImage: boolean): LayoutGeom {
  switch (layout) {
    case 'title': // Centered title slide: big title in the vertical middle, subtitle under it.
      return { title: { x: 838200, y: 2130425, cx: 7467600, cy: 1325563 }, body: { x: 838200, y: 3592525, cx: 7467600, cy: 1325563 }, titleAnchor: 'ctr', titleAlign: 'ctr', bodyAnchor: 't', bodyAlign: 'ctr', titleSz: 5400 };
    case 'section': // Section header: title low-centered over an accent rule, body as a lead-in.
      return { title: { x: 838200, y: 2667000, cx: 7467600, cy: 1325563 }, body: { x: 838200, y: 4191000, cx: 7467600, cy: 1000000 }, titleAnchor: 'ctr', titleAlign: 'ctr', bodyAnchor: 't', bodyAlign: 'ctr', titleSz: 4000, rule: true };
    case 'blank': // No title; body fills the slide.
      return { title: null, body: { x: 838200, y: 838200, cx: 7467600, cy: 5181600 } };
    case 'imageRight': // Title top; body on the left half, image on the right.
      return { title: { x: 838200, y: 365125, cx: 7467600, cy: 1325563 }, body: { x: 838200, y: 1825625, cx: 3886200, cy: 4351338 } };
    case 'titleContent':
    default: // Standard title + content.
      return { title: { x: 838200, y: 365125, cx: 7467600, cy: 1325563 }, body: { x: 838200, y: 1825625, cx: hasImage ? 4351338 : 7467600, cy: 4351338 } };
  }
}

function slideXml(title: string, body: string[], layout: PptxLayout, theme?: PptxTheme, imgRelId?: string): string {
  const headFill = theme ? `<a:solidFill><a:srgbClr val="${hx(theme.heading, '0F172A')}"/></a:solidFill>` : '';
  const bodyFill = theme ? `<a:solidFill><a:srgbClr val="${hx(theme.fg, '1F2933')}"/></a:solidFill>` : '';
  const accentFill = `<a:solidFill><a:srgbClr val="${theme ? hx(theme.accent, '2E5BFF') : '2E5BFF'}"/></a:solidFill>`;
  const g = geomFor(layout, !!imgRelId);
  const bodyAlign = g.bodyAlign === 'ctr' ? ' algn="ctr"' : '';
  const paras = (body.length ? body : [''])
    .map((raw) => {
      const lvl = bulletLevel(raw);
      const t = raw.replace(/^\t+/, '');
      const noBullet = g.bodyAlign === 'ctr' ? '<a:buNone/>' : '';
      const pAttr = `${lvl > 0 ? ` lvl="${lvl}"` : ''}${bodyAlign}`;
      const pPr = noBullet ? `<a:pPr${pAttr}>${noBullet}</a:pPr>` : pAttr ? `<a:pPr${pAttr}/>` : '';
      return `<a:p>${pPr}<a:r><a:rPr lang="en-US" dirty="0">${bodyFill}</a:rPr><a:t>${xml(t)}</a:t></a:r></a:p>`;
    })
    .join('');
  const titleBox = g.title;
  const titleAnchor = g.titleAnchor === 'ctr' ? ' anchor="ctr"' : '';
  const titlePPr = g.titleAlign === 'ctr' ? '<a:pPr algn="ctr"/>' : '';
  const titleSz = g.titleSz ? ` sz="${g.titleSz}"` : '';
  const titleSp = titleBox
    ? `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${layout === 'section' || layout === 'title' ? 'ctrTitle' : 'title'}"/></p:nvPr></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${titleBox.x}" y="${titleBox.y}"/><a:ext cx="${titleBox.cx}" cy="${titleBox.cy}"/></a:xfrm></p:spPr>` +
      `<p:txBody><a:bodyPr${titleAnchor}/><a:lstStyle/><a:p>${titlePPr}<a:r><a:rPr lang="en-US"${titleSz} dirty="0">${headFill}</a:rPr><a:t>${xml(title)}</a:t></a:r></a:p></p:txBody></p:sp>`
    : '';
  // Section accent rule, drawn between title and body.
  const rule = g.rule
    ? `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Rule"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="3886200" y="4038600"/><a:ext cx="1371600" cy="38100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${accentFill}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="${DML}" xmlns:r="${REL}" xmlns:p="${PML}"><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    titleSp +
    rule +
    // Body placeholder
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${g.body.x}" y="${g.body.y}"/><a:ext cx="${g.body.cx}" cy="${g.body.cy}"/></a:xfrm></p:spPr>` +
    `<p:txBody><a:bodyPr${g.bodyAnchor === 'ctr' ? ' anchor="ctr"' : ''}/><a:lstStyle/>${paras}</p:txBody></p:sp>` +
    (imgRelId
      ? `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${imgRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="5410200" y="1825625"/><a:ext cx="3505200" cy="3505200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
      : '') +
    `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`
  );
}

// Theme part — when a DocTheme is supplied, lt1=bg / dk1=fg / accent1=accent so
// the slide background (bgRef → bg1 → lt1) and scheme colours follow it.
const themeXml = (theme?: PptxTheme): string => {
  const lt1 = theme ? `<a:lt1><a:srgbClr val="${hx(theme.bg, 'FFFFFF')}"/></a:lt1>` : `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>`;
  const dk1 = theme ? `<a:dk1><a:srgbClr val="${hx(theme.fg, '000000')}"/></a:dk1>` : `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>`;
  const accent1 = `<a:accent1><a:srgbClr val="${theme ? hx(theme.accent, '2E5BFF') : '2E5BFF'}"/></a:accent1>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<a:theme xmlns:a="${DML}" name="Pyntra"><a:themeElements>` +
    `<a:clrScheme name="Pyntra">${dk1}${lt1}` +
    `<a:dk2><a:srgbClr val="1F2933"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>` +
    `${accent1}<a:accent2><a:srgbClr val="7C3AED"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>` +
    `<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="Pyntra"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Pyntra"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
    `</a:themeElements></a:theme>`
  );
};

const SLIDE_MASTER =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<p:sldMaster xmlns:a="${DML}" xmlns:r="${REL}" xmlns:p="${PML}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>` +
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>` +
  `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
  `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
  `<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`;

const SLIDE_LAYOUT =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<p:sldLayout xmlns:a="${DML}" xmlns:r="${REL}" xmlns:p="${PML}" type="obj" preserve="1"><p:cSld name="Title and Content">` +
  `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>` +
  `<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>`;

/** Decode a base64 image data URL into bytes + its OOXML extension. */
function decodeImage(dataUrl: string | undefined): { ext: 'png' | 'jpeg'; bytes: Uint8Array } | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl ?? '');
  if (!m) return null;
  const ext = m[1]!.toLowerCase() === 'png' ? 'png' : 'jpeg';
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { ext, bytes };
}

export function pagesToPptx(slides: Array<{ title: string; body: string[]; image?: string; layout?: PptxLayout }>, theme?: PptxTheme): Uint8Array {
  const enc = new TextEncoder();
  const sl = slides.length ? slides : [{ title: '', body: [''] }];
  const slideIds = sl.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('');
  const presentation =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="${DML}" xmlns:r="${REL}" xmlns:p="${PML}">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId${sl.length + 1}"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
    `<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  const presRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sl.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sl.length + 1}" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    `<Relationship Id="rId${sl.length + 2}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`;

  const types =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Default Extension="jpg" ContentType="image/jpeg"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    sl.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') +
    `</Types>`;
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`;
  const masterRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`;
  const layoutRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
  const slideRel =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

  const entries = [
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'ppt/presentation.xml', data: enc.encode(presentation) },
    { name: 'ppt/_rels/presentation.xml.rels', data: enc.encode(presRels) },
    { name: 'ppt/theme/theme1.xml', data: enc.encode(themeXml(theme)) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: enc.encode(SLIDE_MASTER) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc.encode(masterRels) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: enc.encode(SLIDE_LAYOUT) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc.encode(layoutRels) },
  ];
  sl.forEach((s, i) => {
    const img = decodeImage(s.image);
    const imgRelId = img ? 'rId2' : undefined;
    const layout: PptxLayout = s.layout ?? (img ? 'imageRight' : 'titleContent');
    entries.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(slideXml(s.title, s.body, layout, theme, imgRelId)) });
    if (img) {
      const media = `image${i + 1}.${img.ext}`;
      const rels =
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/image" Target="../media/${media}"/></Relationships>`;
      entries.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc.encode(rels) });
      entries.push({ name: `ppt/media/${media}`, data: img.bytes as unknown as Uint8Array<ArrayBuffer> });
    } else {
      entries.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc.encode(slideRel) });
    }
  });
  return zipStore(entries);
}
