/**
 * Sub-toolbar that appears when the Add Field tool is active. Picks the
 * /FT type the next drag will mint. Chips are intentionally short so the
 * row fits comfortably under the main ActionToolbar.
 */
import type { CSSProperties } from 'react';
import { TkxButton } from 'tekivex-ui';
import type { NewFieldKind } from './Annotations.js';

interface ChipDef {
  id: NewFieldKind;
  label: string;
  icon: string; // SVG path
}

const CHIPS: ChipDef[] = [
  { id: 'text',      label: 'Text',      icon: 'M4 6h16M4 12h16M4 18h10' },
  { id: 'multiline', label: 'Paragraph', icon: 'M4 6h16M4 10h16M4 14h16M4 18h10' },
  { id: 'checkbox',  label: 'Checkbox',  icon: 'M4 4h16v16H4z M8 12l3 3 6-6' },
  { id: 'dropdown',  label: 'Dropdown',  icon: 'M4 8h16v8H4z M8 11l4 4 4-4' },
  { id: 'date',      label: 'Date',      icon: 'M4 6h16v14H4z M4 10h16 M9 3v4 M15 3v4' },
  { id: 'signature', label: 'Signature', icon: 'M3 19c3-2 6-12 9-12s4 10 6 12 M12 19h6' },
];

interface Props {
  active: NewFieldKind;
  onSelect: (kind: NewFieldKind) => void;
}

const iconStyle: CSSProperties = {
  width: 14,
  height: 14,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function FieldTypePicker({ active, onSelect }: Props) {
  return (
    <div className="v2-field-picker" role="toolbar" aria-label="Field type">
      <span className="v2-field-picker__label">Field type:</span>
      {CHIPS.map((c) => {
        const isActive = c.id === active;
        return (
          <TkxButton variant="ghost" size="sm"
            key={c.id}
            type="button"
            className={'v2-field-picker__chip' + (isActive ? ' v2-field-picker__chip--active' : '')}
            onClick={() => onSelect(c.id)}
            aria-pressed={isActive}
            title={c.label}
          >
            <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
              <path d={c.icon} />
            </svg>
            <span>{c.label}</span>
          </TkxButton>
        );
      })}
    </div>
  );
}
