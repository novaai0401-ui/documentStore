/**
 * Pyntra's own theme directory — an extensible set of document/slide themes
 * (colours + fonts) used across editors (slides today; reusable for documents,
 * exports, and PDF styling). Add a theme here and it appears everywhere a theme
 * picker is shown.
 */
export interface DocTheme {
  id: string;
  name: string;
  bg: string;        // slide / page background
  panel: string;     // surface for body text areas
  fg: string;        // body text colour
  heading: string;   // heading / accent colour
  accent: string;    // accent bar / highlights
  fontHeading: string;
  fontBody: string;
}

export const THEMES: DocTheme[] = [
  { id: 'clean', name: 'Clean', bg: '#ffffff', panel: '#ffffff', fg: '#1f2933', heading: '#0f172a', accent: '#2e5bff', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'midnight', name: 'Midnight', bg: '#0f172a', panel: '#1e293b', fg: '#e2e8f0', heading: '#ffffff', accent: '#38bdf8', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'aurora', name: 'Aurora', bg: '#faf5ff', panel: '#ffffff', fg: '#3b0764', heading: '#7c3aed', accent: '#a855f7', fontHeading: "'Georgia', serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'sunset', name: 'Sunset', bg: '#fff7ed', panel: '#ffffff', fg: '#7c2d12', heading: '#ea580c', accent: '#f97316', fontHeading: "'Georgia', serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'forest', name: 'Forest', bg: '#f0fdf4', panel: '#ffffff', fg: '#14532d', heading: '#15803d', accent: '#22c55e', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'mono', name: 'Mono', bg: '#f8fafc', panel: '#ffffff', fg: '#334155', heading: '#0f172a', accent: '#475569', fontHeading: "ui-monospace, SFMono-Regular, Menlo, monospace", fontBody: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { id: 'ocean', name: 'Ocean', bg: '#f0f9ff', panel: '#ffffff', fg: '#0c4a6e', heading: '#0369a1', accent: '#0ea5e9', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'rose', name: 'Rose', bg: '#fff1f2', panel: '#ffffff', fg: '#881337', heading: '#be123c', accent: '#f43f5e', fontHeading: "'Georgia', serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'slate', name: 'Slate', bg: '#f1f5f9', panel: '#ffffff', fg: '#1e293b', heading: '#0f172a', accent: '#6366f1', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'sand', name: 'Sand', bg: '#fefce8', panel: '#fffdf5', fg: '#713f12', heading: '#a16207', accent: '#d97706', fontHeading: "'Georgia', serif", fontBody: "'Georgia', serif" },
  { id: 'graphite', name: 'Graphite', bg: '#111827', panel: '#1f2937', fg: '#e5e7eb', heading: '#f9fafb', accent: '#f59e0b', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'emerald', name: 'Emerald', bg: '#ecfdf5', panel: '#ffffff', fg: '#064e3b', heading: '#047857', accent: '#10b981', fontHeading: "'Inter', system-ui, sans-serif", fontBody: "'Inter', system-ui, sans-serif" },
  { id: 'grape', name: 'Grape', bg: '#1e1b4b', panel: '#312e81', fg: '#e0e7ff', heading: '#ffffff', accent: '#c4b5fd', fontHeading: "'Georgia', serif", fontBody: "'Inter', system-ui, sans-serif" },
];

export const themeById = (id: string): DocTheme => THEMES.find((t) => t.id === id) ?? THEMES[0]!;
