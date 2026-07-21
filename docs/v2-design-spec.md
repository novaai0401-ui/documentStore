# pdfcraft v2 — Design Spec

> Source of truth for the Figma file `pdfcraft v2`. Paste each frame into Figma; the token tables below feed the variable collection.

---

## Design tokens (Figma Variables collection: `core`)

### Color (mode: Light)
| Token              | Hex       | Use                         |
|--------------------|-----------|-----------------------------|
| `surface/canvas`   | `#F4F5F7` | App background              |
| `surface/paper`    | `#FFFFFF` | PDF page background         |
| `surface/panel`    | `#FAFBFC` | Sidebar / drawer            |
| `border/subtle`    | `#E4E7EB` | Dividers, field outlines    |
| `border/strong`    | `#9AA4B2` | Focused field border        |
| `accent/primary`   | `#2E5BFF` | Primary buttons, focus ring |
| `accent/primaryFg` | `#FFFFFF` | Text on `accent/primary`    |
| `text/primary`     | `#1F2933` | Body                        |
| `text/muted`       | `#52606D` | Helper text                 |
| `state/error`      | `#D64545` | Validation errors           |
| `state/success`    | `#27AB83` | Save confirmation           |

### Spacing (4-pt grid)
`xs=4`, `sm=8`, `md=12`, `lg=16`, `xl=24`, `2xl=32`, `3xl=48`

### Typography
| Style          | Font        | Size | Weight | Line |
|----------------|-------------|------|--------|------|
| `display/h1`   | Inter       | 24   | 600    | 32   |
| `heading/h2`   | Inter       | 18   | 600    | 24   |
| `body/default` | Inter       | 14   | 400    | 20   |
| `body/small`   | Inter       | 12   | 400    | 16   |
| `code/inline`  | JetBrains   | 13   | 400    | 18   |

### Radius
`sm=4`, `md=6`, `lg=10`, `pill=999`

---

## Frame A — Inline Edit Mode (1440 × 900)

Pdfguru/Sejda-style: one toolbar, no side panels, direct field editing on the canvas.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [logo]   File ▾   View ▾                       [Mode: Inline ▾]  [Save] │  ← Top bar (56px)
├──────────────────────────────────────────────────────────────────────────┤
│  [Text] [Links] [Forms ▾] [Images ▾] [Sign ▾] [Whiteout] [Annotate ▾]   │  ← Tool toolbar (48px)
│  [Shapes ▾] [Undo] [Redo]                                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│        ┌────────────────────────────────────────────────────────┐        │
│        │ 1. Name of Assessee (Declarant)  │ 2. PAN of the      │        │
│        │ [_________________________]      │    Assessee        │        │
│        │                                  │ [_______________]  │        │
│        ├──────────────────────────────────┼─────────────┬──────┤        │
│        │ 3. Status                        │ 4. P.Y.     │ 5.RS │        │
│        │ [_______]                        │ [_______]   │ [__] │        │
│        ...                                                              │
│        └────────────────────────────────────────────────────────┘        │
│                                                                          │
│        [< Page 1 / 4 >]                              [- 100% +]          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Components for this frame
1. **TopBar** — logo, file menu, view menu, mode switcher (right-aligned), save button.
2. **Toolbar** — horizontal chip group; each tool is a button with icon + label. Active tool gets `accent/primary` fill.
3. **CanvasFrame** — `surface/paper` background, drop shadow `0 2 8 rgba(0,0,0,0.08)`, centered, max-width 920px.
4. **FieldOverlay** — variants: `text`, `multiline`, `date`, `select`, `checkbox`, `radio`. States: `idle`, `hover`, `focused`, `error`, `disabled`. Renders as transparent input over the PDF page; on focus shows a 2px `accent/primary` outline.
5. **PageNavigator** — prev/next + page counter + zoom stepper. Bottom of canvas.

### Interaction notes
- Click on any AcroForm field → caret enters that field. No popover.
- Tool selection in toolbar changes the canvas cursor + click handler. e.g., `Sign` tool makes the canvas accept signature placement.
- Toolbar collapses to icon-only at <1024px width.

---

## Frame B — Dynamic Form Mode (1440 × 900)

PDF preview left, auto-generated form right. The right side is rendered by the user's chosen UI adapter (default: tekivex-ui).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [logo]   File ▾   View ▾                       [Mode: Form ▾]    [Save] │
├──────────────────────────────────────────┬───────────────────────────────┤
│                                          │  Form (auto-generated)        │
│   ┌────────────────────────────────┐    │                               │
│   │ 1. Name of Assessee            │    │  Name of Assessee *           │
│   │ [filled value shown live]      │    │  [_________________________]  │
│   │                                │    │                               │
│   │ 2. PAN: ABCDE1234F             │    │  PAN *                        │
│   │                                │    │  [ABCDE1234F]                 │
│   │ ...                            │    │  ⓘ Format: 5 letters, 4 digits│
│   └────────────────────────────────┘    │                               │
│                                          │  Previous Year                │
│   [< Page 1 / 4 >]                       │  [2025-26 ▾]                  │
│                                          │                               │
│                                          │  ┌────────────────────────┐   │
│                                          │  │ Save & Download PDF    │   │
│                                          │  └────────────────────────┘   │
└──────────────────────────────────────────┴───────────────────────────────┘
```

### Components
1. **SplitLayout** — 60/40 horizontal split with a draggable divider.
2. **PdfPreviewPane** — read-only canvas; shows live updates as form values change.
3. **DynamicFormPane** — scrollable column of `DynamicFormRow` components.
4. **DynamicFormRow** — variants per field type. Each row = label (top), input (middle), helper/error (bottom). Required indicator = `*` in `state/error`.
5. **FormSubmitBar** — sticky bottom; primary "Save & Download" + secondary "Reset".

### Adapter swap demo
Top of the right pane shows a small `[Adapter: tekivex ▾]` dropdown for the demo. In production this is a build-time choice, not a runtime toggle.

---

## Frame C — Help / BYO-UI Drawer (right-side drawer, 480 × 900)

Triggered from a `?` icon in the TopBar.

```
┌────────────────────────────────────────┐
│  Help & Theming                    [×] │
├────────────────────────────────────────┤
│  ▸ Quick start                         │
│  ▸ Using your own UI library           │
│    ├ The adapter interface             │
│    ├ Example: Material UI              │
│    ├ Example: Plain HTML               │
│    └ Example: tekivex-ui (default)     │
│  ▸ Plugin system                       │
│  ▸ Keyboard shortcuts                  │
│                                        │
│  ┌────────────────────────────────────┐│
│  │ interface UIAdapter {              ││
│  │   Text:   (p) => JSX.Element       ││
│  │   Number: (p) => JSX.Element       ││
│  │   Select: (p) => JSX.Element       ││
│  │   Check:  (p) => JSX.Element       ││
│  │   Button: (p) => JSX.Element       ││
│  │   Label:  (p) => JSX.Element       ││
│  │ }                                  ││
│  └────────────────────────────────────┘│
│                                        │
│  [Copy snippet]   [Open on GitHub →]   │
└────────────────────────────────────────┘
```

### Components
1. **HelpDrawer** — slide-in from right, `surface/panel` background, 480px wide.
2. **TocItem** — collapsible list item with chevron.
3. **CodeBlock** — `code/inline` font, `surface/canvas` background, 1px `border/subtle`, copy button top-right.

---

## Component inventory (build these as Figma components)

| Component         | Variants                                                    |
|-------------------|-------------------------------------------------------------|
| `TopBar`          | `default`, `with-doc-title`                                 |
| `Toolbar`         | `expanded`, `icon-only`                                     |
| `ModeSwitcher`    | `inline`, `form`                                            |
| `FieldOverlay`    | type × {text, date, select, check, radio}; state × 5        |
| `DynamicFormRow`  | type × 5; required true/false; error true/false             |
| `PageNavigator`   | `default`                                                   |
| `HelpDrawer`      | section × {quickstart, byo-ui, plugins, shortcuts}          |
| `CodeBlock`       | `inline`, `block`                                           |
| `Button`          | `primary`, `secondary`, `ghost`; size × {sm, md}            |
| `Input`           | `text`, `select`, `check`; state × 5                        |

---

## Mapping to code (Track C)

Each Figma component above ships as code via Figma Code Connect (`.figma.ts` files) once `@pdf-ui/react` lands:

- `TopBar` → `<TopBar>` in `@pdf-ui/react`
- `Toolbar` → `<Toolbar>` + `<ToolbarItem>`
- `FieldOverlay` → `<FieldOverlay>` (Mode 1)
- `DynamicFormRow` → renders via `UIAdapter` (Mode 2)
- `Button`, `Input` → live in each `@pdf-ui/adapter-*` package, not in `@pdf-ui/react` itself

This keeps the Figma component library aligned with the BYO-UI architecture: primitives that vary per adapter live in adapters; structural components live in the shared package.
