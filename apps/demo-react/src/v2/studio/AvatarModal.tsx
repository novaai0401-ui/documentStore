/**
 * Avatar builder modal — pick skin, hair, eyes, mouth, glasses, headwear and
 * background from swatches/buttons, watch a live preview, shuffle for ideas,
 * then drop the avatar onto the design (or download it). Fully on-device: the
 * portrait is composed from SVG primitives in avatar.ts — nothing uploads.
 */
import { useMemo, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, buildAvatarSvg, randomAvatar, type AvatarOptions } from './avatar.js';
import { svgToDataUrl } from './clipart.js';
import { loadImage } from './imageRender.js';
import { downloadBytes } from '../smart/util.js';

export function AvatarModal({ onClose, onInsert }: { onClose: () => void; onInsert: (dataUrl: string) => void }) {
  const [opts, setOpts] = useState<AvatarOptions>(DEFAULT_AVATAR);
  const [busy, setBusy] = useState(false);
  const svg = useMemo(() => buildAvatarSvg(opts), [opts]);
  const url = useMemo(() => svgToDataUrl(svg), [svg]);
  const set = (k: keyof AvatarOptions, v: string) => setOpts((o) => ({ ...o, [k]: v }));

  const downloadSvg = () => downloadBytes('avatar.svg', new TextEncoder().encode(svg), 'image/svg+xml');
  const downloadPng = async () => {
    setBusy(true);
    try {
      const img = await loadImage(url);
      const c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 512, 512);
        const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
        downloadBytes('avatar.png', new Uint8Array(await blob.arrayBuffer()), 'image/png');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner avatar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🧑‍🎨 Avatar builder</strong><button className="brand-x" onClick={onClose}>✕</button></div>
        <div className="avatar-body">
          <div className="avatar-preview">
            <img src={url} alt="Avatar preview" width={200} height={200} />
            <TkxButton variant="outline" size="sm" onClick={() => setOpts(randomAvatar())}>🎲 Shuffle</TkxButton>
          </div>
          <div className="avatar-controls">
            {AVATAR_OPTIONS.map((dim) => (
              <div key={dim.key} className="avatar-dim">
                <span className="avatar-dim-label">{dim.label}</span>
                <div className="avatar-dim-choices">
                  {dim.choices.map((ch) => {
                    const active = opts[dim.key] === ch.id;
                    return ch.swatch ? (
                      <button
                        key={ch.id}
                        className={'avatar-swatch' + (active ? ' on' : '')}
                        style={{ background: ch.swatch }}
                        title={ch.label}
                        aria-label={ch.label}
                        aria-pressed={active}
                        onClick={() => set(dim.key, ch.id)}
                      />
                    ) : (
                      <button
                        key={ch.id}
                        className={'avatar-chip' + (active ? ' on' : '')}
                        aria-pressed={active}
                        onClick={() => set(dim.key, ch.id)}
                      >{ch.label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="brand-actions avatar-actions">
          <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => { onInsert(url); onClose(); }}>Add to design</TkxButton>
          <TkxButton variant="outline" size="sm" onClick={downloadSvg}>SVG</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => void downloadPng()}>PNG</TkxButton>
        </div>
      </div>
    </div>
  );
}
