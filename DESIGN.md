---
name: Ethereal Glass Lumina
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e6'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f2ff'
  surface-container: '#ededfa'
  surface-container-high: '#e7e7f4'
  surface-container-highest: '#e1e1ef'
  on-surface: '#191b24'
  on-surface-variant: '#494454'
  inverse-surface: '#2e303a'
  inverse-on-surface: '#f0f0fd'
  outline: '#7a7486'
  outline-variant: '#cac3d7'
  surface-tint: '#673fd6'
  primary: '#663ed5'
  on-primary: '#ffffff'
  primary-container: '#7f5af0'
  on-primary-container: '#ffffff'
  inverse-primary: '#cdbdff'
  secondary: '#006783'
  on-secondary: '#ffffff'
  secondary-container: '#70d6ff'
  on-secondary-container: '#005c75'
  tertiary: '#7540bc'
  on-tertiary: '#ffffff'
  tertiary-container: '#8f5ad7'
  on-tertiary-container: '#ffffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e7deff'
  primary-fixed-dim: '#cdbdff'
  on-primary-fixed: '#20005f'
  on-primary-fixed-variant: '#4e1dbe'
  secondary-fixed: '#bce9ff'
  secondary-fixed-dim: '#6cd3fc'
  on-secondary-fixed: '#001f2a'
  on-secondary-fixed-variant: '#004d63'
  tertiary-fixed: '#eddcff'
  tertiary-fixed-dim: '#d8baff'
  on-tertiary-fixed: '#290055'
  on-tertiary-fixed-variant: '#5d24a3'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e1ef'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-desktop: 2rem
  margin: 1.5rem
  margin-desktop: 3rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system expresses an ethereal, futuristic intelligence through iridescent glass physics, fluid bioluminescence, and weightless organic volumes. Designed for an ultra-modern desktop AI copilot, the interface completely discards sharp geometric boxes in favor of soft, pill-shaped conduits, curved islands, and translucent frosted membranes. 

The mood is calm, hyper-intelligent, and inspiring—evoking the sensation of floating light particles, soap bubbles under studio lighting, and smooth refractive crystal. The design movement marries **Glassmorphism** with **Organic Futuristic Fluidity**: translucent backdrops with high-order Gaussian blurs (`backdrop-filter: blur(24px)` to `40px`), specular highlights along curved perimeter borders, and spectral iridescent gradients (spanning cyan, lilac, and electric violet).

## Colors

The palette balances airy high-key luminescence with deep obsidian typography for crystalline legibility.

- **Primary (`#7f5af0` / `#b580ff`):** Electric and lavender violet represent synthetic neural processing, active states, key CTAs, and ambient focal points.
- **Secondary (`#70d6ff` / `#a0e8ff`):** Luminous celestial cyan evokes breath, fluid audio waves, and generative highlights.
- **Surfaces & Canvas:** 
  - Canvas background: Multi-stop organic radial meshes drifting between `#ffffff`, `#f3f6ff`, and `#faf4ff`.
  - Glass Containers: Semi-opaque milk glass (`rgba(255, 255, 255, 0.65)` to `rgba(255, 255, 255, 0.82)`) paired with inner specular glows (`inset 0 1px 1px rgba(255, 255, 255, 0.9)`).
- **Neutral Accents & Text (`#0f111a` & `#1a1c29`):** Dense, deep ink tone ensuring AA/AAA contrast ratios against frosted translucent layers. Subdued labels use `#61667d`.

## Typography

**Plus Jakarta Sans** is deployed universally across all tiers. Its geometry provides welcoming warmth with humanist curves, perfectly matching the curvature of floating glass capsules.

Italicized styling is used sparingly for conversational AI accents and poetic prompts (e.g., *“lets jump in, Wilson?”*). Headings leverage tight negative tracking to produce sleek, polished editorial cadence, while small utility labels use gentle expansion for crystal clarity over frosted backdrops.

## Layout & Spacing

The spatial architecture prioritizes continuous breathing room and floating islands over traditional edge-to-edge partitioning.

- **Desktop Framework:** A centered, floating canvas system (max content width: 1440px) surrounded by dynamic atmospheric gradients. Panels, conversation threads, and input fields float as self-contained capsules.
- **Micro-Spacers:** Component internals utilize generous vertical and horizontal padding (`space-md` to `space-lg`) to preserve the illusion of inflated, buoyant surfaces.
- **Reflow Architecture:** At viewport widths under 1024px, multi-column copilot toolbars collapse into floating sticky bottom drawer capsules, preserving peripheral edge margins of at least `1.5rem`.

## Elevation & Depth

Depth is articulated through physical optical refraction rather than standard drop shadows:

1. **Membrane Layer (Base Glass):** `background: rgba(255, 255, 255, 0.65)`, `backdrop-filter: blur(28px) saturate(180%)`, framed by an ultra-thin gradient hairline stroke `linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.2))`.
2. **Elevated Floating Islands (Chat Prompts, Cards):** `background: rgba(255, 255, 255, 0.85)`, accompanied by two diffuse atmospheric shadow tiers:
   - Ambient dispersion: `0 20px 40px -15px rgba(127, 90, 240, 0.12)`
   - Specular foundation: `0 4px 12px rgba(15, 17, 26, 0.03)`
3. **Iridescent Glow Tiers (Active Controls / AI Processing Orbs):** Chromatic radial luminescence leaking from behind active components using soft violet and cyan glows (`filter: drop-shadow(0 0 24px rgba(112, 214, 255, 0.45))`).

## Shapes

The shape system explicitly forbids sharp, rectangular corners. Everything conforms to continuous fluid curvature:

- **Universal Roundedness (`3` - Pill-Shaped):** Buttons, chips, input text boxes, audio pills, and floating dock bars employ full pill radiuses (`border-radius: 9999px` or minimum `2rem`).
- **Content Islands & Modular Panels:** Use expansive organic curvature (`border-radius: 2.25rem` to `3rem`).
- **Sphere Metaphor:** Core AI presence, avatar states, voice triggers, and toggle switches are shaped as pure circles or morphing iridescent droplets.

## Components

### Buttons
- **Primary AI Pill:** Full pill radius (`9999px`), solid gradient fill running from `#7f5af0` to `#b580ff` or high-gloss white with inset rim highlight. Crisp white or dark typography. Hover triggers an expanding chromatic glow.
- **Glass / Ghost Capsule:** `rgba(255, 255, 255, 0.7)` backdrop, fine `1px` translucent border, ink text `#0f111a`. Hover increases opacity to `0.9` with slight inward lift.

### Input Prompt Bar
- Wide floating pill floating anchored near the bottom canvas. Contains an inner recessed frosted trench, micro-pill mode badges (*"AI mode"*, *"Standard"*), voice waveform indicators, and a circular gradient action button.

### Chips & Action Suggestions
- Ultra-soft translucent glass bubbles with pastel vector icons enclosed in soft tinted circular wells. Typography set in `body-sm` (`#1a1c29`). No squared corners.

### Conversational Chat Bubbles
- **User Bubbles:** Crisp white pill-shaped capsules (`background: #ffffff`, subtle elevation shadow, crisp dark text).
- **Assistant Stream:** Borderless flowing typography alongside miniature floating iridescent glass orb avatars; multi-item suggestion outputs rendered as smooth continuous carousel capsules with pastel thumbnails.

### Voice & Ambient Audio Visualizer
- Concentric iridescent ripple rings with soft gradient blend modes (`mix-blend-mode: multiply` / `screen`) animating harmonically around a central circular mic capsule.