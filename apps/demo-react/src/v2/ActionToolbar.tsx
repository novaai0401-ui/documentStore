import { useState, type CSSProperties } from 'react';
import { TkxButton } from 'tekivex-ui';

export type ToolName =
  | 'select'
  | 'add-text'
  | 'edit-text'
  | 'eraser'
  | 'draw'
  | 'highlight'
  | 'shapes'
  | 'image'
  | 'hyperlink'
  | 'sign'
  | 'stamp'
  | 'crop'
  | 'add-fields'
  | 'redact'
  | 'ai-region';

interface ToolDef {
  id: ToolName;
  label: string;
  iconPath: string; // single SVG path d="..." string
  /** When true, button is dimmed and shows "Coming soon" tooltip. */
  comingSoon?: boolean;
}

// Minimalist outline icons — single path each, 24×24 viewBox, stroke-only.
const TOOLS: ToolDef[] = [
  {
    id: 'add-text',
    label: 'Add Text',
    iconPath: 'M4 7h16M12 7v14',
  },
  {
    id: 'edit-text',
    label: 'Edit text',
    iconPath: 'M4 4h12l4 4v12H4z M16 4v4h4',
  },
  {
    id: 'eraser',
    label: 'Eraser',
    iconPath: 'M3 17l8-8 6 6-8 8H3v-6z M14 6l4-4 4 4-4 4',
  },
  {
    id: 'draw',
    label: 'Draw',
    iconPath: 'M3 21h4l11-11-4-4L3 17v4z M14 7l3-3',
  },
  {
    id: 'highlight',
    label: 'Highlight',
    iconPath: 'M9 21h6 M5 17l4-12h6l4 12 M7 14h10',
  },
  {
    id: 'shapes',
    label: 'Shapes',
    iconPath: 'M3 3h7v7H3z M14 17a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M14 3h7l-3.5 7z',
  },
  {
    id: 'image',
    label: 'Image',
    iconPath: 'M3 3h18v18H3z M3 16l5-5 4 4 3-3 6 6 M16 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
  {
    id: 'hyperlink',
    label: 'Hyperlink',
    iconPath: 'M10 14a4 4 0 0 1 0-6l3-3a4 4 0 1 1 6 6l-1 1 M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 1 1-6-6l1-1',
  },
  {
    id: 'sign',
    label: 'Sign',
    iconPath: 'M3 19c3-2 6-12 9-12s4 10 6 12 M12 19h6',
  },
  {
    id: 'stamp',
    label: 'Stamp',
    iconPath: 'M5 19h14v2H5z M9 4v6l-3 3v3h12v-3l-3-3V4',
  },
  {
    id: 'crop',
    label: 'Crop',
    iconPath: 'M6 2v16h16 M2 6h16v16',
  },
  {
    id: 'add-fields',
    label: 'Add fields',
    iconPath: 'M3 7h12v4H3z M3 13h12v4H3z M19 4v16 M16 12h6',
  },
  {
    id: 'redact',
    label: 'Redact',
    iconPath: 'M3 4h10v6H3z M3 14h18v6H3z',
  },
  {
    id: 'ai-region',
    label: 'Ask AI',
    iconPath: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  },
];

interface Props {
  active: ToolName;
  onSelect: (tool: ToolName) => void;
  /** Optional whitelist of tools to render. Omit to show all. */
  enabled?: ToolName[];
}

/** Short hint that appears in the status strip when a tool is active.
 *  Tells the user whether to click or drag, and what gets created. */
export const TOOL_HINTS: Record<ToolName, string> = {
  'select': 'No tool selected. Pick one from the toolbar above.',
  'add-text': 'Click anywhere on the page to drop an editable text box.',
  'edit-text': 'Click any line of text — the box is pre-filled with the real words at the right size. Retype like in Word; on save the original is whited-out and your text redrawn.',
  'eraser': 'Swipe over anything to erase it — drag like a brush to white it out.',
  'draw': 'Click and drag to draw free-hand lines on the page.',
  'highlight': 'Drag a rectangle to highlight a region in translucent yellow.',
  'shapes': 'Drag a rectangle to draw an outlined shape.',
  'image': 'Click on the page to open the file picker and place an image.',
  'hyperlink': 'Click on the page to open the link dialog (label + URL).',
  'sign': 'Click on the page to open the signature pad.',
  'stamp': 'Click on the page to pick a stamp preset (APPROVED, etc.) and place it.',
  'crop': 'Drag a rectangle to mark a crop region (visual only for now).',
  'add-fields': 'Pick a field type below, then drag a rectangle on the page to place it.',
  'redact': 'Drag a rectangle to mark a region for redaction (black fill).',
  'ai-region': 'Drag a rectangle over any part of the page — the text inside is sent to the AI panel so you can ask about just that part.',
};

const iconStyle: CSSProperties = {
  width: 18,
  height: 18,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/**
 * Sejda-style action toolbar. Each tool has a stable `id` so the parent
 * AppV2 can dispatch on it. Most tools are stubbed (the `comingSoon`
 * flag dims them and surfaces a tooltip).
 */
const COLLAPSE_KEY = 'pdfcraft.toolbar.collapsed';

export function ActionToolbar({ active, onSelect, enabled }: Props) {
  const allow = enabled ? new Set(enabled) : null;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const activeLabel = TOOLS.find((t) => t.id === active)?.label;

  return (
    <div className={'v2-actions-wrap' + (collapsed ? ' v2-actions-wrap--collapsed' : '')}>
      <TkxButton
        type="button"
        variant="ghost"
        size="sm"
        className="v2-actions-toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="v2-actions-row"
        title={collapsed ? 'Show tools' : 'Hide tools'}
      >
        <span className="v2-actions-toggle__chevron" aria-hidden>{collapsed ? '▸' : '▾'}</span>
        <span>{collapsed ? (activeLabel ? `Tools · ${activeLabel}` : 'Tools') : 'Tools'}</span>
      </TkxButton>
      {!collapsed && (
        <div id="v2-actions-row" className="v2-actions" role="toolbar" aria-label="Editing tools">
          {TOOLS.filter((t) => !allow || allow.has(t.id)).map((tool) => {
            const isActive = active === tool.id;
            const cls =
              'v2-action' +
              (isActive ? ' v2-action--active' : '') +
              (tool.comingSoon ? ' v2-action--coming-soon' : '');
            return (
              <TkxButton
                key={tool.id}
                type="button"
                variant="ghost"
                size="sm"
                className={cls}
                title={tool.comingSoon ? `${tool.label} — coming soon` : tool.label}
                aria-label={tool.label}
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? 'select' : tool.id)}
              >
                <svg viewBox="0 0 24 24" style={iconStyle} aria-hidden="true">
                  <path d={tool.iconPath} />
                </svg>
                <span className="v2-action__label">{tool.label}</span>
              </TkxButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
