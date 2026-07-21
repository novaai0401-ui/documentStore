import { describe, it, expect } from 'vitest';
import { bulletLevel, pagesToPptx } from './pptxExport.js';
import { unzipSync, strFromU8 } from 'fflate';

describe('pptx bullet levels', () => {
  it('reads indent level from leading tabs (capped at 4)', () => {
    expect(bulletLevel('top')).toBe(0);
    expect(bulletLevel('\tsub')).toBe(1);
    expect(bulletLevel('\t\t\tdeep')).toBe(3);
    expect(bulletLevel('\t\t\t\t\t\tx')).toBe(4);
  });

  it('emits <a:pPr lvl="N"> for indented bullets and strips the tabs', () => {
    const bytes = pagesToPptx([{ title: 'T', body: ['Top', '\tSub', '\t\tDeep'] }]);
    const files = unzipSync(bytes);
    const slide = strFromU8(files['ppt/slides/slide1.xml']!);
    expect(slide).toContain('<a:pPr lvl="1"/>');
    expect(slide).toContain('<a:pPr lvl="2"/>');
    expect(slide).toContain('<a:t>Sub</a:t>');   // tab stripped from the text
    expect(slide).not.toContain('\tSub');
  });
});

describe('pptx image export', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  it('embeds an image as a media part + slide rel + picture shape', () => {
    const bytes = pagesToPptx([{ title: 'With image', body: ['Bullet'], image: PNG }]);
    const files = unzipSync(bytes);
    expect(Object.keys(files).some((n) => n.startsWith('ppt/media/image1.png'))).toBe(true);
    const rels = strFromU8(files['ppt/slides/_rels/slide1.xml.rels']!);
    expect(rels).toContain('/image');
    const slide = strFromU8(files['ppt/slides/slide1.xml']!);
    expect(slide).toContain('<p:pic>');
    expect(slide).toContain('r:embed="rId2"');
    const ct = strFromU8(files['[Content_Types].xml']!);
    expect(ct).toContain('Extension="png"');
  });
  it('omits the picture when there is no image', () => {
    const files = unzipSync(pagesToPptx([{ title: 'No image', body: ['x'] }]));
    expect(strFromU8(files['ppt/slides/slide1.xml']!)).not.toContain('<p:pic>');
  });
});

describe('pptx layout geometry', () => {
  const slideOf = (layout: any) => strFromU8(unzipSync(pagesToPptx([{ title: 'T', body: ['sub'], layout }]))[ 'ppt/slides/slide1.xml']!);
  it('title slide centres the title and uses ctrTitle', () => {
    const s = slideOf('title');
    expect(s).toContain('type="ctrTitle"');
    expect(s).toContain('anchor="ctr"');
    expect(s).toContain('sz="5400"');           // larger title type
    expect(s).toContain('<a:off x="838200" y="2130425"/>'); // vertically centred box
  });
  it('section header draws an accent rule and centres', () => {
    const s = slideOf('section');
    expect(s).toContain('name="Rule"');
    expect(s).toContain('type="ctrTitle"');
    expect(s).toContain('algn="ctr"');
  });
  it('blank layout has no title placeholder', () => {
    const s = slideOf('blank');
    expect(s).not.toContain('name="Title"');
    expect(s).not.toContain('type="title"');
  });
  it('titleContent keeps the standard title at the top', () => {
    const s = slideOf('titleContent');
    expect(s).toContain('type="title"');
    expect(s).toContain('<a:off x="838200" y="365125"/>');
  });
});
