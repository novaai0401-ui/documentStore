# tekivex-ui migration plan (raw HTML → design system)

**Goal:** every interactive control in the app is a `tekivex-ui` component, not a
raw HTML element — for one visual language, consistent a11y/keyboard/focus
behaviour, theming (light/dark) from one source, and free mobile ergonomics.

**Why now:** the Studio editor (the surface users spend the most time in, and the
one flagged as "too many tools, hard to edit on mobile") is mostly raw
`<button>`/`<div>`/`<input>`. Standardising it also fixes the mobile density
problem, because the tekivex primitives (`TkxDrawer`, `TkxMenu`, `TkxSegmented`)
give us proper bottom-sheets and overflow menus instead of a wrapping button row.

## Current state (audit)

| Area | Raw `<button>` | Notes |
|---|---:|---|
| `studio/` | ~132 | StudioEditor (34), ImageStudio, ScannerModal, VideoEditor, PagesRail, LayersPanel, modals |
| `editors/` | ~43 | TextEditor, SheetEditor, SlideEditor, ToolPalette |
| `ai/` | ~14 | AiPanel |
| `collab/` | ~7 | chat / invite |
| app shell | ~24 | Workspace |
| **total** | **~234** | plus **31** raw `.v2-modal` shells that should become `TkxModal` |

Already on tekivex: `TkxButton` (649 uses), `TkxSelect`, `TkxInput`, `TkxCheckbox`,
`TkxModal`, `TkxCard`, `TkxBadge`, `TkxSlider`, `TkxToggle`, `TkxRow/Col`.

## Component mapping

| Raw pattern | Replace with |
|---|---|
| `<button class="…">` | `TkxButton` (variant/size/colorScheme/leftIcon/isFullWidth) |
| icon-only `<button>` | `TkxButton variant="ghost"` + `TkxIcon` |
| `<div class="v2-modal">…</div>` | `TkxModal` (size, title, footer) |
| custom dropdown / `ToolbarMenu` | `TkxMenu` (action/check/radio items) |
| mobile bottom panel (`mobilePanel`) | `TkxDrawer placement="bottom"` |
| view/mode toggles (grid/table, tabs) | `TkxSegmented` / `TkxTabs` |
| `<input type=color/text>` rows | `TkxInput` (+ a small colour-swatch wrapper) |
| toolbars (icon rows) | `TkxToolbar` (items model) |

## Phased order (each phase is its own PR, shippable independently)

1. **Studio chrome — DONE (this PR):** left "Add" rail + top action bar buttons →
   `TkxButton`; secondary actions collapse into a `TkxDrawer` bottom sheet on
   phones via a new `useIsMobile()` hook. This is the highest-traffic surface and
   the mobile-density fix.
2. **Studio side panels:** `LayersPanel`, `PagesRail`, `ToolbarMenu` → `TkxButton`
   + `TkxMenu`; the sticker/clipart pickers → tidy `TkxButton` grids inside a
   `TkxDrawer` on mobile.
3. **Studio modals → `TkxModal`:** convert the ~20 `.v2-modal` studio shells
   (Draw, Qr, Scanner, MagicResize, Brand, Convert, Compress, Protect, Sign,
   Watermark, MailMerge, Animate, Avatar, Paywall, …). Mechanical: header/body/
   footer already map to `TkxModal` props.
4. **Document editors:** `TextEditor`, `SheetEditor`, `SlideEditor`, `DocxEditor`
   toolbars → `TkxToolbar` + `TkxButton`; grid/table view toggles → `TkxSegmented`.
   (These are also the surfaces still hardcoded in English — do the i18n pass in
   the same PR.)
5. **App shell & AI/collab:** `Workspace` header, `AiPanel`, chat/invite → tekivex.
6. **Lint guard:** add an ESLint rule (or a `no-restricted-syntax` on `JSXElement`
   named `button`/`select` in `src/v2/**`) so new raw controls can't creep back in,
   with a short allowlist for genuinely primitive cases (e.g. hidden file inputs).

## Conventions (apply as we convert)

- Buttons: `variant` = `solid` (primary CTA) / `outline` (secondary) / `ghost`
  (toolbar/icon) / `link` (inline). One `solid primary` per toolbar.
- Every control keeps its `title`/`aria-label`; icon-only buttons must have one.
- Prefer `isFullWidth` in stacked/mobile contexts over CSS width hacks.
- Mobile: restructure (drawer/menu), don't just restyle — use `useIsMobile()` to
  branch rendering, not only media queries.
- Keep pure-logic modules (engine, effects, billing) framework-free; only the
  `*.tsx` view layer takes tekivex.

## Effort estimate

~234 buttons + 31 modals. Phases 1–2 (Studio interactive surfaces) are the
user-visible win and are ~1–2 focused PRs. Phases 3–5 are mostly mechanical and
can be chipped away. The lint guard (phase 6) makes the end-state durable.
