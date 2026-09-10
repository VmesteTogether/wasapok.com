# VmesteSoft — Design Spec

`vmestetogether.com/soft`

A tab-bar suite of small, single-purpose browser tools. Everything runs client-side;
no uploads, no accounts, no analytics.

The look: **dark, green, minimal cyberpunk with a skate-punk mouth.** Hard corners,
hairline rules, screaming condensed caps, terminal monospace, one acid-green accent
doing all the shouting. Restraint everywhere except the accent.

This document is the contract. Every tool obeys it. If a tool needs something not in
here, add it here first.

---

## 0. The rule above all others

**If it isn't doing a job, it isn't on the page.**

A control does a job. A value the user has to read does a job. A label that names an
unlabelled control does a job. Everything else is decoration wearing a sentence.

Deleted on sight, no exceptions:

- Footers. Taglines. Straplines. Mission statements.
- Any sentence that explains the tool instead of being the tool. `IMAGE COMPRESSOR`
  above a compressor needs no paragraph underneath telling you it compresses images.
- Reassurance copy — "nothing is uploaded", "runs in your browser", "no accounts",
  "works offline". All true, none of it a feature the page has to say out loud.
- Descriptions on the index cards. The name and the format tags are the description.
- Onboarding, empty-state pep talk, "get started", "welcome", tips, hints that repeat
  what the control already says.
- Icons that sit next to a text label saying the same thing.

Kept:

- The tool's name, once, as the `h1`.
- The two-digit index and slug in the eyebrow — that's the address, not a description.
- Field labels, values, counts, sizes, errors.
- One line of help **only** where the interface genuinely cannot express the rule
  itself — a format limit, a hard maximum, a caveat that changes what the user does.

When in doubt, cut it. The page is finished when removing one more thing would break
something.

---

## 1. Architecture

Each tool is its own page. Every page carries an identical tab bar, so it reads as a
tabbed app; switching tabs is a full navigation.

```
soft/
  DESIGN_SPEC.md        this file
  vmestesoft.css        the shared design system — tokens + chrome + components
  index.html            00 · INDEX      landing / tool directory
  compressor/index.html 01 · COMPRESS   shrink images, batch, zip out
  formatter/index.html  02 · FORMAT     resize / convert / rename, batch
  merger/index.html     03 · MERGE      combine + reorder PDF pages
  qr/index.html         04 · QR         styled QR codes
  vmestenizer/index.html 05 · VMESTENIZE  vm-prefix every word
  haiku/index.html      06 · HAIKU      one deterministic haiku a day
```

Plus `orbhome.js`, the corner sphere every tool page shares.

Rules:

- **`vmestesoft.css` is linked by every page and is the only place tokens live.**
  A tool never redefines a token value. It may add tool-scoped classes under its own
  prefix, in an inline `<style>` *after* the link.
- Third-party libraries load per-page, only where used (pdf-lib + pdf.js in merge,
  jszip in compress/format, libheif in compress, qr-code-styling in qr).
- No build step. No framework. Plain HTML, one stylesheet, inline modules.
- Every page keeps its CSP meta, `referrer` meta and `X-Content-Type-Options` meta.
  Tools that hit no network drop `connect-src` entirely.

### Naming

The GG-era puns are gone. No `Imagge`, no `MERGGER`, no `GGenerator`, no `GGnator`,
no Garden Grove, no city seals, no navy, no gold, no Flaming Cheetos accent.

| Was | Is |
| --- | --- |
| Imagge Compressor | Image Compressor |
| Imagge Formatter | Image Formatter |
| PDF MERGGER | PDF Merger |
| QR GGenerator | QR Generator |
| GGnator | Vmestenizer |
| Daily Haiku | Daily Haiku |
| GG IT Toolbox | VmesteSoft |

Wordmark is always `VMESTE` + `SOFT`, set solid, `SOFT` in `--acid`. Never a logo image.

---

## 2. Color

All tokens are defined on `:root` in `vmestesoft.css`. **The suite is dark only** —
there is no light theme, and the old theme switch is removed from every tool.

### Ground

| Token | Value | Use |
| --- | --- | --- |
| `--void` | `#050D0B` | page background, the floor |
| `--tar` | `#0A1714` | card / panel surface |
| `--slab` | `#0F221D` | raised surface, inputs, table rows |
| `--house` | `#003332` | the vmeste house teal — chrome bar, tab strip |
| `--pit` | `#020706` | wells, drop targets, code blocks, canvas backing |

### Line

| Token | Value | Use |
| --- | --- | --- |
| `--line` | `#193830` | default hairline, 1px |
| `--line-hi` | `#2A5B4E` | hover / emphasized hairline |

### Accent

| Token | Value | Use |
| --- | --- | --- |
| `--acid` | `#00FF9C` | *the* accent — active tab, focus, primary action, key numbers |
| `--acid-dim` | `#00B871` | pressed acid, secondary strokes, meter fills |
| `--acid-ghost` | `rgba(0,255,156,0.10)` | accent wash behind active/selected things |
| `--toxic` | `#C6FF3D` | the second voice — highlight, badge, "new", the one gag |
| `--rust` | `#FF4A2B` | destructive, errors, remove buttons |
| `--amber` | `#FFB020` | warnings, "heads up", non-blocking problems |

### Text

| Token | Value | Use |
| --- | --- | --- |
| `--bone` | `#E4F3EC` | primary text |
| `--ash` | `#8DAFA3` | secondary text, labels, help |
| `--ghost` | `#4C6E64` | disabled, placeholders, hints |

### The tool hues

The index is the one page carrying more than one accent, because there the six tools
*are* the content and colour is how you tell them apart. The hues are analogous — a
sweep from cyan through green to lime — which is what lets six accents share a screen
and still read as one set instead of a fruit bowl. They are ordered so no orb matches
the one above it or beside it in the grid.

| Tool | Hue | |
| --- | --- | --- |
| Compress | `#00FF9C` | the house accent |
| Format | `#4DB8FF` | sky |
| Merge | `#C6FF3D` | lime |
| QR | `#00E5FF` | cyan |
| Vmestenize | `#7CFF4D` | spring |
| Haiku | `#29E0C4` | teal |

Each renders as five steps — four shades through the sphere, plus a light tint the
hovered orb shifts up into. **These belong to the index and nowhere else.** A tool page
uses `--acid` and only `--acid`; it never tints itself with its own hue.

### Color rules

1. **One accent per screen state**, everywhere except the index. `--acid` marks exactly
   one thing at a time in a given region: the active tab, the focused field, the primary
   button. If two things are acid, one of them is wrong.
2. `--toxic` appears at most **once per page**. It is a punchline, not a palette.
3. Never put `--acid` on a large fill. It is a 1–2px stroke, a text color, or a
   ≤32px block. The only exception is a primary button.
4. Destructive is always `--rust`, always with a text label, never icon-only.
5. Never use pure `#000` or pure `#FFF`.
6. No gradients on chrome. A gradient is allowed only inside a tool's own canvas or
   preview art.

### Contrast

`--bone` on `--void` is ~14:1. `--ash` on `--void` is ~6:1. `--ghost` on `--void` is
~3.4:1 — **hints and placeholders only, never a value the user must read**. `--acid`
on `--void` is ~11:1 and safe for small text.

---

## 3. Type

Two families do all the work. Load exactly these:

```html
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

- **Barlow Condensed 800**, uppercase — headings, tab labels, the wordmark, buttons.
  This is the shout. Always uppercase, always tracked out.
- **Space Mono 400/700** — every number, filename, size, dimension, hex code, count,
  keyboard hint, status line. If a machine produced it, it is mono.
- **Barlow 400/500** — sentences. Help text, descriptions, empty states.

Never `Press Start 2P`, `VT323`, or any pixel face. Those were the arcade era.

### Scale

| Token | Size / tracking | Element |
| --- | --- | --- |
| `--t-display` | 44px / 800 / `0.02em` | page title (`h1`) |
| `--t-title` | 24px / 800 / `0.06em` | section heading (`h2`) |
| `--t-label` | 12px / 700 / `0.18em` | field labels, tab labels, eyebrows — mono |
| `--t-body` | 15px / 400 | sentences |
| `--t-data` | 13px / 400 | mono values, table cells |
| `--t-micro` | 11px / 700 / `0.14em` | badges, chips, meta — mono |

Line height: `1.1` on display/title, `1.5` on body, `1.35` on data.

---

## 4. Geometry & depth

- **Radius is `0`.** Everywhere. No rounded corners on any chrome, ever.
- Borders are `1px solid var(--line)`. Emphasis is `1px solid var(--acid)`, never 2px.
- **Notched corners** are the signature move. Primary buttons, the active tab, and
  panel headers get a 8px corner cut via `clip-path`:
  ```css
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  ```
  Use it sparingly — one notched element per panel.
- **Depth is a hard offset shadow, never a blur.** `box-shadow: 4px 4px 0 var(--acid-dim)`
  on hover for interactive cards; `2px 2px 0` for buttons. Blurred shadows are banned.
- **Glow is rationed.** `0 0 12px rgba(0,255,156,0.25)` is allowed on exactly one
  element per page — the primary action, or the active canvas. Nowhere else.
- Spacing scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Nothing between.
- Max content width `1180px`, gutter `24px` desktop / `16px` mobile.

### Textures

Two, both optional, both subtle:

1. **Hazard stripes** — 45° `--acid-dim` at 8% over `--pit`, 8px pitch. Progress bars,
   loading states, drag-over drop zones. Animate by translating the background 8px in
   `800ms linear infinite`.
2. **Scanline** — a single 1px `rgba(0,255,156,0.06)` horizontal repeat at 3px pitch,
   only over canvas/preview wells. Never over text.

No noise, no grain, no CRT curvature, no chromatic aberration.

---

## 5. Chrome

### 5.1 The index

The index is not a tool and does not sit in a row of tools. It is a single
character grid: the wordmark built as a 5×7 bitmap extruded into voxels and
projected each frame, and the six tools as noise-distorted spheres shaded
into the same grid, each in its own hue from the table in §2.

The wordmark is set **`VmesteSoft`** — the product's own capitalisation, caps
on the V and S. Lowercase glyphs sit on the baseline at x-height; only `f` and
`t` carry ascenders, so the two caps stand clear of the run between them. It
sets on one line above 900px and stacks to `Vmeste` / `Soft` below. Either way
it is the same ten letters and letters 6–9 are `Soft`, which is what the
brighter band keys off, so it reads the same in both layouts.

**It is drawn, not set.** Every letter gets its own small tilt (±5°), baseline
drift and size, and every voxel a little edge wobble. All of it is seeded by
index rather than by time — seed it by time and the letterforms boil.

**The cursor melts it.** Within a radius that scales with the wordmark, the
neighbourhood is *warped* rather than thrown clear: swirled around the pointer
by up to ~120°, pushed by a travelling ripple, and bloomed slightly outward so
it reads as pressure. The voxels stay near where they were, so the letterform
survives as a melted version of itself instead of vanishing into a hole — the
letters underneath stay legible the whole time, just dimmed by a band or two.

Corruption is **scattered through** that warp, never solid. The chance a voxel
turns into a glyph from `/\|<>[]{}!?$&#@%*` climbs with the eruption but is
capped below 1, so bright junk erupts *through* the warped letters rather than
replacing them. Corrupted glyphs are held at ~18 changes/sec — redraw them
every frame and it fizzes into white noise instead of churning.

Strength is eased both ways, so it follows the pointer continuously and decays
to exactly nothing when it leaves. Under `prefers-reduced-motion` it never
engages. Every sphere
has a real `<a>` carrying its name positioned over it, so the page is
clickable, tabbable and readable without seeing the art at all. No numbers
on the labels — the name is the label, and the tools are not a sequence you
work through in order.

### 5.2 The home orb — the only chrome on a tool page

**A tool page has no bar and no title block.** Both were furniture: the bar
listed six things you were already looking at one of, and the title block
named a tool whose interface names itself.

What is left is the same distorted sphere the index draws, in that tool's own
hue — the one element on a tool page allowed a colour other than `--acid`. It
links to the index.

It is **hung over the corner**, not placed inside it: `top: -64px; left: -64px`
at 176px (128px at `-48px` under 860px), so the viewport edge crops a slice off
the sphere and it reads as something drifting in from outside the page. Its
canvas is transparent and clears rather than fills — an opaque one painted its
own background over the page and left a dark square in the corner.

**Do not sweep this stylesheet for dead rules with a line-level regex.** One
did, and it took `.vs-shell` and `h2` with the tab-bar rules it was aimed at.
Remove rules by matching a selector and walking to its closing brace.

Hovering or focusing swells it, brightens it into its tint, and fades in a
single mono word, `ALL TOOLS`. **The element never changes size.** Growing the
box would re-quantise the character grid — the sphere would climb through whole
cells at a time and the swell would come out stepped. Instead the box is fixed
at its fullest and the renderer eases a `grow` value toward its target a
fraction per frame (~350ms to settle), driving radius, wobble amplitude and
brightness together. Cells cross into the tint band a few at a time rather than
the whole sphere flipping at once.

The markup lives in the page and the shared `orbhome.js` only animates the
canvas inside it, so the way back still works with scripts blocked. The
tool's name stays in the page as an `sr-only` `<h1>`: invisible, but still
there for screen readers, the tab title and search.

The page offset lives on `body.has-orb`, not on the main element — each
tool's skin sets a `padding` shorthand on its own main, which would reset a
`padding-top` set there.

```
┌────────────────────────────────────────────────────────────┐
│ VMESTE|SOFT   00 INDEX  01 COMPRESS  02 FORMAT  03 MERGE …  │  ← sticky
└────────────────────────────────────────────────────────────┘
```

- `position: sticky; top: 0; z-index: 100`, background `--house`, bottom border
  `1px solid var(--line)`.
- Height `52px`. Wordmark left, tabs right, no clock, no email button, no music
  button, no theme switch. All four are removed.
- Tab: mono `--t-label`, `--ash`. Index number in `--ghost` before the name.
- Hover: label → `--bone`, index → `--ash`.
- **Active tab**: label → `--acid`, index → `--acid-dim`, plus a 2px `--acid` bar
  along the *bottom* edge of the tab and `--acid-ghost` fill. Marked
  `aria-current="page"`.
- Below `860px` the tab strip scrolls horizontally, no wrap, no hamburger. Hide the
  scrollbar; the active tab scrolls itself into view on load.
- Every page also renders `<a class="skip-link" href="#main">Skip to content</a>` as
  the first body child.

### 5.3 Footer

There isn't one. See §0.

---

## 6. Components

### Panel
`background: var(--tar); border: 1px solid var(--line); padding: 24px`. A panel header
is a mono `--t-label` row in `--ash` with a `--line` bottom rule, notched top-right.

### Button

| Variant | Fill | Text | Border | Use |
| --- | --- | --- | --- | --- |
| primary | `--acid` | `--void` | none, notched | the one action per panel |
| default | transparent | `--bone` | `--line` | everything else |
| danger | transparent | `--rust` | `--rust` | remove, clear, delete |
| quiet | transparent | `--ash` | none | tertiary, inline |

All buttons: Barlow Condensed 800, uppercase, `0.12em` tracking, `10px 20px`, radius 0.
Hover shifts `translate(-1px,-1px)` and gains `2px 2px 0` hard shadow in its own color.
Active returns to `translate(0,0)` with `1px 1px 0`. Transition `100ms`.
Disabled: `--ghost` text, `--line` border, no motion, `cursor: not-allowed`.

### Input / select / textarea
`background: var(--pit); border: 1px solid var(--line); color: var(--bone)`, mono,
`10px 12px`, radius 0. Focus: `border-color: var(--acid)` + `outline: 1px solid var(--acid);
outline-offset: 1px`. Placeholder `--ghost`. Labels sit above, mono `--t-label`, `--ash`.

### Range
Track 2px `--line`; filled portion `--acid-dim`; thumb a 14×14 `--acid` square, radius 0.
The live value sits to the right in mono `--acid`.

### Chip / toggle group
Bordered `--line` boxes, mono `--t-micro`, uppercase. Selected: `--acid` border,
`--acid-ghost` fill, `--acid` text, `aria-pressed="true"`. Never rely on fill alone —
selected state must survive a grayscale screenshot, so the border changes too.

### Drop zone
Dashed `1px --line` over `--pit`, min-height 180px, centered mono prompt in `--ash`.
Drag-over: solid `--acid` border, hazard-stripe background, prompt → `--acid`.
Always paired with a real `<input type="file">` and a keyboard-reachable browse button.

### File / page row
Mono. Thumbnail or index left, filename center (truncate with `text-overflow: ellipsis`),
size and actions right. Row separator `1px --line`. Hover `--slab`.
Reorder handles are drag *and* keyboard (`↑`/`↓` buttons with `aria-label`).

### Banner
Full-width, `1px` left border 3px in the state color, `--slab` fill, mono `--t-data`.
`info` → `--acid`, `warn` → `--amber`, `error` → `--rust`, `ok` → `--acid`.
Dismissible banners get a `×` button with `aria-label="Dismiss"`.

### Progress
2px `--line` track, `--acid` fill, plus a mono percentage in `--acid` to its right.
Indeterminate work uses the animated hazard stripe, not a spinner.

---

## 7. Motion & accessibility

- Transitions `100ms` (hover/press) or `160ms` (panel/tab change). Nothing longer.
- Easing: `linear` or `steps()`. No spring, no bounce, no `ease-in-out` on chrome.
- Wrap every ambient animation (Vmestenizer's backdrop, hazard stripes, the scanline)
  in `@media (prefers-reduced-motion: reduce) { animation: none }` and render a
  correct still frame.
- Focus is always visible: `outline: 1px solid var(--acid); outline-offset: 2px`.
  Never `outline: none` without a replacement.
- Every icon-only control needs `aria-label`. Every status change writes to a
  visually-hidden `aria-live="polite"` region.
- Targets are ≥40px tall on touch.
- The suite is keyboard-complete: no drag-only interaction anywhere.

---

## 8. Voice

Applies to the text that survives §0 — labels, values, errors, the few real hints.
Short, flat, a little rude. Lowercase sentences under uppercase headings.

- Good: `drop images here`, `nothing uploaded. this all happens on your machine.`,
  `4 files · 12.8 MB → 3.1 MB`
- Bad: `Please select the files you would like to compress!`, `Success! 🎉`, `Oops!`

No emoji. No exclamation marks. Errors say what broke and what to do:
`heic decode failed — try a jpg`, not `An error occurred`.
