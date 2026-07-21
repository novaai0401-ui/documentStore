/**
 * A "★ Brand" button + brand-kit manager, reusable across the document editors so
 * you can create/activate a brand kit (logo, colours, fonts) without leaving the
 * editor. On close it calls `onChange` so the editor can refresh its theme list
 * (the active kit shows up as a "<name> (brand)" theme).
 */
import { useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { BrandManager } from '../../studio/BrandManager.js';

export function BrandButton({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TkxButton variant="outline" size="sm" onClick={() => setOpen(true)} title="Brand kits — apply your logo, colours and fonts as a theme">★ Brand</TkxButton>
      {open && <BrandManager onClose={() => { setOpen(false); onChange(); }} />}
    </>
  );
}
