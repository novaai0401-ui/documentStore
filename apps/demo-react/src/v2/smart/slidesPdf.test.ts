import { describe, it, expect } from 'vitest';
import { slidesToPdf } from './slidesPdf.js';

// 1x1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('slidesToPdf', () => {
  it('renders a multi-layout deck (with an image) to a valid PDF', async () => {
    const bytes = await slidesToPdf([
      { title: 'Title Slide', body: ['Subtitle here'], layout: 'title' },
      { title: 'Agenda', body: ['Point one', '\tsub point', 'Point two'], layout: 'titleContent' },
      { title: 'With Image', body: ['Bullet A', 'Bullet B'], layout: 'imageRight', image: PNG },
      { title: 'Section', body: [], layout: 'section' },
    ], { bg: '#0b1220', fg: '#e2e8f0', heading: '#ffffff', accent: '#38bdf8' });
    expect(bytes.length).toBeGreaterThan(800);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('handles an empty deck and a bad image gracefully', async () => {
    const bytes = await slidesToPdf([{ title: 'x', body: [], layout: 'imageRight', image: 'data:image/png;base64,notreal' }]);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
