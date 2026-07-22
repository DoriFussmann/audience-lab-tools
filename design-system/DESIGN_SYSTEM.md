# Design System

Exact values extracted from the Audience Lab Tools codebase (`tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `components/LoginGate.tsx`, `components/Dashboard.tsx`, `app/page.tsx`). No invented tokens.

---

## Color palette

| Token | Hex / value | Role |
|-------|-------------|------|
| `blueprint` | `#2c4a6e` | Login left panel base |
| `grid-line` | `rgba(255,255,255,0.9)` at layer `opacity: 0.07` | Blueprint grid strokes |
| `radial-highlight` | `rgba(120,160,200,0.35)` | Upper-left radial |
| `radial-shadow` | `rgba(40,70,110,0.55)` | Lower-right radial |
| `white` / surface | `#ffffff` | Body + card backgrounds |
| `line` | `#e6e6e6` | Borders, dividers |
| `ink` | `#1a1a1a` | Body / primary text |
| `muted` | `#8a8a8a` | Secondary text, idle controls |
| `soft` | `#fafafa` | Soft fills, hover / active nav |
| `accent` | `#2f5eff` | Status complete, links, errors |
| `check` | `#6a9a78` | Confirmed checkmarks |
| `placeholder` | `#b5b5b5` | Input placeholders |
| `scrollbar` | `#e0e0e0` | Thin scrollbar thumb |

Login panel copy opacities (on white): `text-white/50` (eyebrow), `text-white/70` (subcopy), `text-white/40` (footer).

---

## Typography

**Family:** Inter (`var(--font-inter)`), fallbacks `system-ui`, `sans-serif`.  
**Loaded weight:** `400` only.  
**Global rule:** `font-weight: 400 !important` on `*` — **no bold.** Classes like `font-medium` are neutralized.  
**Letter-spacing:** `-0.01em` on `*`.  
**Smoothing:** `-webkit-font-smoothing: antialiased`.  
**Base size:** `13px` on `body` (`text-[13px]`).

| Role | Classes | Computed |
|------|---------|----------|
| Hero display (login) | `text-5xl leading-tight tracking-tight` | 48px / 400 / line-height 1.25 / tracking −0.025em / white |
| Page title | `text-[15px] text-ink` | 15px / 400 / ink |
| Card title | `font-medium text-ink` | 13px / forced 400 / ink |
| Body | default / `text-ink` | 13px / 400 / ink |
| Muted metadata | `text-muted` | 13px / 400 / `#8a8a8a` |
| Nav items | inherit (13px) | 13px / 400 |
| Login subcopy | `text-[15px] leading-relaxed text-white/70` | 15px / line-height 1.625 |
| Login eyebrow / footer | `text-[13px] text-white/50` · `text-white/40` | 13px |
| Mobile brand | `text-2xl tracking-tight` | 24px |

---

## Blueprint panel recipe

Left half of the auth layout (`md+`). Exact construction from `LoginGate.tsx`:

```html
<div class="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#2c4a6e] px-14 py-12 text-white md:flex">
  <!-- 1. Dual radial gradients -->
  <div class="pointer-events-none absolute inset-0" style="background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(120,160,200,0.35), transparent 55%),
    radial-gradient(ellipse 70% 50% at 85% 80%, rgba(40,70,110,0.55), transparent 50%);"></div>
  <!-- 2. Grid texture -->
  <div class="pointer-events-none absolute inset-0 opacity-[0.07]" style="
    background-image:
      linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px);
    background-size: 48px 48px;"></div>
  <!-- 3. Content (relative): eyebrow · hero · footer -->
</div>
```

Stack order: base fill `#2c4a6e` → radials → 48×48 grid at 7% opacity → relative copy.

---

## Cards

| Property | Value |
|----------|-------|
| Background | `bg-white` (`#ffffff`) |
| Border | `1px solid` `border-line` (`#e6e6e6`) |
| Radius | `rounded-xl` → **8px** (`0.5rem`) |
| Header padding | `px-4 py-3` |
| Body padding | `px-4 py-3` (+ `border-t border-line`) |
| Shadow | **none** |
| Hover (header button) | `hover:bg-soft` (`#fafafa`) |
| Expand motion | `.expand-panel`: `grid-template-rows` 0fr→1fr, `0.28s ease-out` |

Header row: title + optional muted meta (left); status + chevron (right). Status uses `text-accent` when complete, else `text-muted`.

---

## Layout patterns

### Auth — 50/50 split

```
flex h-screen
├── Left:  w-1/2  blueprint panel (hidden below md)
└── Right: w-full md:w-1/2  centered sign-in card
           card: max-w-[420px] rounded-xl border-line p-6
```

### App shell

```
mx-auto flex h-screen max-w-[1280px] flex-col
├── Top bar: h-12 (48px), border-b border-line, pr-4
│   ├── Left:  w-52 project dropdown (bordered select + chevron)
│   └── Right: text actions (Share, Saved, Sign out) — gap-4
└── Body: flex min-h-0 flex-1
    ├── Left nav: w-52 (208px), border-r, p-3, gap-3 bordered items
    └── Content: flex-1 → scroll-thin px-8 py-6 → max-w-3xl column
```

---

## Components

### Left nav item

```
w-full rounded-lg border px-3 py-2 text-left
default: border-line text-muted hover:bg-soft hover:text-ink
active:  border-line bg-soft text-ink
```

Radius `rounded-lg` = **6px**.

### Status text (card)

Right-aligned: status label (`text-accent` | `text-muted`) + chevron SVG (`h-4 w-4 text-muted`, stroke 2, polyline `6 9 12 15 18 9`; open → `rotate-180`, `transition-transform duration-200`).

### Middle-dot metadata

Unicode middle dot ` · ` (U+00B7) between muted fragments, e.g.  
`3 confirmed · 1 skipped · 12 left · 2/4 categories`.

### Inputs

```
rounded-lg border border-line px-3 py-2
password: + pr-10; eye toggle absolute right-3, text-muted hover:text-ink
placeholder: #b5b5b5; outline: none
```

### Primary / disabled button

```
rounded-lg border border-line px-3 py-2 text-muted hover:text-ink disabled:opacity-40
```

Ghost outlined — no filled primary. Compact variant: `px-3 py-1.5`.

---

## Voice

Minimal labels. No explanatory UX copy. Placeholders and button text only (“Email”, “Password”, “Continue”, “Sign out”, “Saved”). One short helper where unavoidable: “Access is managed by your administrator.”

---

## Radius scale (Tailwind overrides)

| Token | Value | px |
|-------|-------|-----|
| `lg` | `0.375rem` | 6 |
| `xl` | `0.5rem` | 8 |
| `2xl` | `0.75rem` | 12 |

## Spacing reference

| Element | Classes |
|---------|---------|
| Shell max width | `max-w-[1280px]` |
| Content column | `max-w-3xl` |
| Page padding | `px-8 py-6` |
| Nav / project width | `w-52` |
| Top bar | `h-12` |
| Login card | `max-w-[420px]`, `p-6` |
| Login panel pad | `px-14 py-12` |
