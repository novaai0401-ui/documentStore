/**
 * Re-download the public-domain deity paintings used by the studio's Sacred
 * Images picker, into apps/demo-react/public/sacred/.
 *
 * Every source is a Raja Ravi Varma (1848–1906) work on Wikimedia Commons —
 * PUBLIC DOMAIN worldwide (PD-old-100-expired / PD-Art). We pull the 900px
 * thumbnail so the bundle stays small. Run: `node scripts/fetch-sacred-art.mjs`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'demo-react', 'public', 'sacred');

// id → Wikimedia file title (all Raja Ravi Varma, all public domain).
const ART = {
  ganesha: 'File:Ganapati1.jpg',
  durga: 'File:Goddess Durga by Raja Ravi Varma.jpg',
  lakshmi: 'File:Raja Ravi Varma, Goddess Lakshmi, 1896.jpg',
  saraswati: 'File:Goddess Saraswati by Raja Ravi Varma, 1896.jpg',
  'radha-krishna': 'File:Radha in the Moonlight.jpg',
  hanuman: 'File:Maruti.JPG',
  shiva: 'File:Shiva as an ascetic.jpg',
  murugan: 'File:Murugan by Raja Ravi Varma.jpg',
};

const api = 'https://commons.wikimedia.org/w/api.php';
const ua = { 'User-Agent': 'PyntraBot/1.0 (offline greeting app; public-domain art)' };

await mkdir(OUT, { recursive: true });
for (const [id, title] of Object.entries(ART)) {
  const q = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '900', titles: title });
  const meta = await (await fetch(`${api}?${q}`, { headers: ua })).json();
  const page = Object.values(meta.query.pages)[0];
  const thumb = page?.imageinfo?.[0]?.thumburl;
  if (!thumb) { console.error(`✗ ${id}: no thumbnail`); continue; }
  const buf = Buffer.from(await (await fetch(thumb, { headers: ua })).arrayBuffer());
  await writeFile(join(OUT, `${id}.jpg`), buf);
  console.log(`✓ ${id}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log('Done. Public-domain deity paintings by Raja Ravi Varma.');
