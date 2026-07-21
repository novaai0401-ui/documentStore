/**
 * Shared "Save as template" action. Captures the host editor's current document
 * (via getSeed) and stores it as a reusable custom template, prompting for a
 * name. Reused by every editor so the capture path is identical everywhere.
 */
import { useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { addCustomTemplate } from './customTemplates.js';
import type { TemplateDoc } from './templates.js';

interface Props {
  getSeed: () => TemplateDoc;
  defaultName: string;
}

export function SaveTemplateButton({ getSeed, defaultName }: Props) {
  const [saved, setSaved] = useState(false);
  const onClick = () => {
    const title = window.prompt('Save as template — give it a name:', defaultName);
    if (!title) return;
    const seed = getSeed();
    addCustomTemplate(title, { ...seed, name: seed.name || defaultName });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };
  return (
    <TkxButton variant="ghost" size="sm" onClick={onClick} title="Save this document as a reusable template">
      {saved ? '✓ Saved' : '☆ Save as template'}
    </TkxButton>
  );
}
