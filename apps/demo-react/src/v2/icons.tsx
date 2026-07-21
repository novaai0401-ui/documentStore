/**
 * Central icon set — one consistent, professional stroke-icon vocabulary
 * (Lucide, MIT-licensed, bundled locally — no CDN) used across the workspace so
 * tools read as an enterprise app rather than emoji. Every icon shares the same
 * size and stroke weight via <Icon/>, so the toolbar and tool cards stay visually
 * uniform.
 */
import {
  FolderOpen, Palette, Image as ImageIcon, Archive, RefreshCw, ScanLine,
  CircleDot, Film, Mail, Home, Command, Sun, Moon, Monitor, FileText,
  PenLine, Combine, ShieldCheck, Stamp, LayoutGrid, Smile, Grid3x3, FilePlus2, Lock, Download,
  Clapperboard, Music, StickyNote, type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  open: FolderOpen,
  design: Palette,
  image: ImageIcon,
  compress: Archive,
  convert: RefreshCw,
  scan: ScanLine,
  record: CircleDot,
  video: Film,
  invitation: Mail,
  library: Home,
  command: Command,
  themeLight: Sun,
  themeDark: Moon,
  themeSystem: Monitor,
  resume: FileText,
  letter: PenLine,
  combine: Combine,
  sign: ShieldCheck,
  watermark: Stamp,
  collage: LayoutGrid,
  meme: Smile,
  tools: Grid3x3,
  form: FilePlus2,
  lock: Lock,
  download: Download,
  videoedit: Clapperboard,
  audio: Music,
  notes: StickyNote,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Render a named icon at a uniform size/stroke for toolbar buttons and tiles. */
export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.9} className={className} aria-hidden focusable={false} />;
}
