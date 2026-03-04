# UI Pattern Reference: AI Tell Catalog

Companion to **Skill_UIPatterns.md**. This file contains the full pattern catalog with detailed descriptions, code examples, and fixes. Consult when you need to understand what a pattern looks like or how to fix it. The skill file contains the enforceable rules, detection heuristic, and mandatory checklist.

**Before adding to this file:** Pattern must be observable across multiple AI tools (v0, Lovable, Bolt, Claude artifacts), specific enough to detect in code or screenshot, and fixable with a concrete alternative. If you can't show a before/after, it's not ready.

## How to use this file

Look up specific pattern numbers referenced in Skill_UIPatterns.md, or scan a full category when reviewing a page layout. Patterns are grouped by type: layout, surface, typography, components, interaction, and spacing.

---

## LAYER FRAMEWORK

The skill file introduces two layers. Here's how to use them in practice.

**Layer 1 (Defaults)** patterns appear in any AI output with a basic prompt. Detection: compare the output to shadcn/ui defaults and Tailwind starter templates. If it's identical, it's Layer 1.

**Layer 2 (Overcompensation)** patterns appear when prompts explicitly request "premium," "unique," or "not generic" output. Detection: the element has no functional justification — it exists to signal sophistication. SVG noise overlays, glassmorphism, GSAP scroll stacking, magnetic cursors.

**Layer 2 is harder to detect** because each individual technique is legitimate when used with purpose. The tell is accumulation: when a page has noise texture AND glassmorphism AND parallax AND scroll-triggered animations AND magnetic buttons, it's a prompt that said "make it premium" and the AI applied everything in its "premium" bucket.

---

## LAYOUT & COMPOSITION

### 1. Card-in-Card Recursion

**Problem:** AI wraps every content group in a card component because cards are the safest container. A settings page becomes a card containing a grid of cards each containing a form field. A dashboard becomes a card containing rows of cards containing individual metrics. The recursive nesting creates visual noise — every element has its own border, shadow, and padding, fighting for the eye.

**The tell:** Count the nested `<Card>` or `rounded-* border` wrappers. If removing an outer card would look cleaner, it shouldn't exist.

**AI-typical:**
```jsx
<Card>           {/* page wrapper — unnecessary */}
  <Card>         {/* section wrapper — unnecessary */}
    <div className="grid grid-cols-3 gap-4">
      <Card>     {/* metric card — this one is justified */}
        <p>Total Users</p>
        <p>12,405</p>
      </Card>
      <Card><p>Revenue</p><p>$84K</p></Card>
      <Card><p>Growth</p><p>+12%</p></Card>
    </div>
  </Card>
</Card>
```

**Fix:** Cards are for grouping comparable, scannable items (a grid of markets, a list of positions). Sections within a page don't need card wrappers — use headings and spacing. Forms don't need card wrappers per field — use a single container or no container.

```jsx
<section className="space-y-6">
  <h2>Overview</h2>
  <div className="grid grid-cols-3 gap-4">
    <Card><p>Total Users</p><p>12,405</p></Card>
    <Card><p>Revenue</p><p>$84K</p></Card>
    <Card><p>Growth</p><p>+12%</p></Card>
  </div>
</section>
```

**Test:** Remove the outermost card. Does anything break visually? If not, it was scaffolding, not design.

---

### 2. Grid of Three

**Problem:** AI defaults to three equal columns because it's balanced and handles most content widths well. Three feature cards. Three pricing tiers. Three testimonials. Three stats. The three-column grid is the "Additionally," of UI — technically fine, never wrong, immediately recognizable as unthinking default.

**The tell:** Content forced into three items when the natural count is different. A fourth feature gets dropped or a second gets invented to maintain the grid. Or legitimately four items are crammed into three columns with one spanning two.

**Fix:** Let content dictate layout. Four stats? Use four columns or a 2×2 grid. Two key features? Give them more horizontal space each. Seven team members? Don't artificially limit to three. An asymmetric layout (2-wide + 1-narrow, or full-width + supporting sidebar) shows intentionality.

**Test:** Is the number three a content decision or a layout decision? If you'd have three items regardless of the grid, it's fine. If you reshaped content to fit three columns, it's the pattern.

---

### 3. Information Density Allergy

**Problem:** AI produces spacious, airy layouts with generous padding because sparse layouts are "clean" and safe for general audiences. For marketing sites this can work. For professional tools, dashboards, and data-heavy applications, it actively harms usability. Users of financial dashboards, admin panels, or protocol interfaces need to compare numbers without scrolling. One metric per oversized card with 2rem padding is a waste of screen real estate.

**The tell:** Large `p-6` or `p-8` on every card. Single metric displayed where four could fit. Scroll required to see data that should be visible at once. Content floating in whitespace.

**AI-typical:**
```jsx
<Card className="p-8">
  <p className="text-sm text-gray-500">Total Deposits</p>
  <p className="text-4xl font-bold mt-4">$155.7M</p>
</Card>
{/* This card is 200px tall showing two lines of text */}
```

**Fix:** Match density to audience. Professional tools: tight padding (`p-3` or `p-4`), multiple metrics per card, compact typography. Marketing pages: more air is fine, but still not maximum padding on every element.

```jsx
<Card className="p-3">
  <div className="flex items-baseline justify-between">
    <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Deposits</span>
    <span className="text-xs text-green-500">▲ 3.2%</span>
  </div>
  <p className="text-xl font-semibold tracking-tight mt-1">$155.7M</p>
</Card>
{/* Same info, 80px tall, room for three more cards in the same viewport */}
```

**Audience test:** Would the user of this interface prefer to see more data without scrolling, or more space around each item? For dashboards and professional tools, the answer is almost always more data.

---

### 4. Bento Grid

**Problem:** The asymmetric card mosaic layout (one tall card, two short, one wide) became popular in 2023-2024 as a way to break the uniform grid. AI tools adopted it as the go-to "interesting" landing page layout. It's now a stronger AI signal than the uniform grid it replaced — the pattern is so specific that seeing a bento grid immediately suggests AI generation.

**The tell:** Mix of card sizes in a grid that doesn't map to content importance or relationships. A small card and a large card contain equally important features — the size is decorative, not semantic.

**Fix:** If card sizes vary, they should reflect content hierarchy. The largest card should contain the most important or complex content. If all features are equally important, an equal grid is more honest. Or skip the grid entirely — a vertical scroll with full-width sections is underused because AI never generates it.

---

### 5. Hero Section Formula

**Problem:** AI hero sections follow a rigid template: large heading (often with a word in gradient text), subtitle paragraph, two buttons (primary filled + secondary ghost/outline), and an abstract background (gradient mesh, blob, or placeholder image). This template is so consistent across AI tools that it functions as a fingerprint.

**The tell:** All five elements present: oversized heading, explanatory subtitle, primary CTA, secondary CTA, abstract decorative background. Often the heading uses a gradient or highlight on one key word.

**AI-typical:**
```jsx
<section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 to-black">
  <div className="text-center max-w-3xl">
    <h1 className="text-6xl font-bold">
      The Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Finance</span>
    </h1>
    <p className="text-xl text-gray-400 mt-6">A next-generation protocol for...</p>
    <div className="flex gap-4 justify-center mt-8">
      <Button>Get Started</Button>
      <Button variant="outline">Learn More</Button>
    </div>
  </div>
</section>
```

**Fix:** Not every page needs a hero section. If it does, break the formula: lead with a data point instead of a tagline. Use an asymmetric layout (content left, visual right). Skip the subtitle if the heading is clear. One CTA is often enough — two buttons is hedging. Replace abstract backgrounds with something content-specific or skip the background entirely.

---

### 6. Form-as-Card-Stack

**Problem:** AI wraps each form group in its own card, creating a vertical stack of bordered containers for what should be a single flowing form. A settings page becomes five cards stacked vertically, each containing one or two inputs. The visual separation between form groups is heavier than the separation between sections of different purpose.

**The tell:** Multiple `<Card>` wrappers around form sections that could be groups within a single form container. Each card has its own padding and border, creating repetitive visual weight.

**Fix:** Use a single form container (or no container). Separate groups with headings, subtle dividers, or spacing — not full card wrappers. Cards are for things you'd want to compare side by side or act on independently. Form fields within the same submission aren't independent — they shouldn't look independent.

---

## SURFACE & COLOR

### 7. Tailwind Default Palette

**Problem:** AI uses Tailwind's named colors directly — `bg-gray-900`, `text-indigo-500`, `border-purple-600` — without any custom color work. The result looks like a Tailwind starter template because it literally uses the same hex values. Developers and designers with experience instantly recognize these specific hues.

**The tell:** Inspect any colored element. If the hex values match Tailwind's default palette exactly (e.g., `#6366f1` for indigo-500, `#7c3aed` for violet-600, `#111827` for gray-900), no custom color work has been done.

**Fix:** Define a project-specific color palette, even if it starts from Tailwind values. Shift hues, adjust saturation, create custom semantic tokens. A `--brand-primary: #5b4ec4` (slightly desaturated, shifted indigo) reads as intentional. `indigo-500` reads as default.

**Minimum effort fix:** In `tailwind.config`, extend the color palette with custom brand colors and use those everywhere instead of default names. Even 3-4 custom colors transforms the feel.

---

### 8. Meaningless Gradients

**Problem:** AI applies gradient fills to elements for "visual interest" when the gradient encodes no information. Gradient backgrounds behind sections, gradient fills on buttons, gradient text on headings. Each one individually might be a design choice; accumulated across a page, they signal AI generation.

**Three variants to watch:**
- **Background wash:** Purple-to-blue gradient behind a section. Purely decorative.
- **Button gradient:** Subtle gradient fill on a CTA. Signals "2024 AI template."
- **Gradient text:** Heading with `-bg-clip-text bg-gradient-to-r`. The single strongest Layer 1 tell on headings.

**Fix:** Gradients should encode data (chart fills showing magnitude) or create intentional depth (very subtle surface differentiation between stacked layers). On buttons, use flat fills. On headings, use a single color. On backgrounds, use solid colors or very subtle gradients that are barely perceptible (same hue, 2-3% lightness difference).

**Test:** Set the gradient to a flat color. Did the element lose meaning or just decoration? If decoration, use the flat color.

---

### 9. Shadow and Blur Overuse

**Problem:** AI adds `shadow-lg` or `shadow-xl` to every card, creating a page where everything floats above everything else. The alternative AI pattern is glassmorphism: `bg-white/10 backdrop-blur-xl border border-white/20`. Both create false depth — elements competing for visual elevation instead of using surface color to establish hierarchy.

**The tell:** Every card has the same shadow. Or: the page has glassmorphism on elements that don't overlay other content (glassmorphism on a standalone card that doesn't sit atop an image or gradient is purely decorative).

**Fix:** In dark themes, you often need zero box shadows. Layer hierarchy comes from background color: `bg-zinc-950` (base) → `bg-zinc-900` (surface) → `bg-zinc-800` (elevated). In light themes, use minimal shadows (`shadow-sm`) on truly elevated elements (dropdowns, modals, popovers) and no shadow on inline cards — use border or background differentiation instead.

**Glassmorphism is legitimate** when content genuinely overlays variable backgrounds (a floating panel over a map, a toolbar over a canvas). On standalone cards with solid backgrounds behind them, it's decoration.

---

### 10. Noise Texture Overlay

**Problem:** A Layer 2 overcompensation pattern. Prompts requesting "premium" or "not generic" output trigger AI to add an SVG `<feTurbulence>` noise overlay at low opacity. This was a legitimate design technique in 2022-2023 that became an AI tell through overuse. The prompt file uploaded this session explicitly prescribes it: "Implement a global CSS Noise overlay (SVG turbulence at 0.05 opacity) to eliminate flat digital gradients."

**The tell:** A full-page `::before` or `::after` pseudo-element with an SVG noise filter, typically at 0.03-0.07 opacity. Sometimes paired with a grain texture image at low opacity. The element covers the entire viewport and exists only for texture.

**Fix:** If the surface feels too flat, the issue is usually color and contrast, not texture. Add subtle variation through slightly different background values for different sections, or use border colors to create separation. If you genuinely want texture, use it on one accent element (a card background, a section divider), not globally. Global grain at uniform opacity is a filter, not a design decision.

---

## TYPOGRAPHY & HIERARCHY

### 11. Typography Flatness

**Problem:** AI creates typographic hierarchy using only font size. Heading is `text-3xl`, body is `text-sm`, label is `text-xs`. No variation in weight, letter-spacing, text-transform, or opacity. The result is legible but flat — elements are bigger or smaller without feeling semantically different.

**AI-typical:**
```jsx
<p className="text-xs text-gray-500">Total Deposits</p>
<p className="text-3xl font-bold">$155.7M</p>
```

**Fix:** Use multiple axes of typographic variation. A label should look categorically different from a value, not just smaller.

```jsx
<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
  Total Deposits
</p>
<p className="text-2xl font-semibold tracking-tight text-foreground">
  $155.7M
</p>
```

The label uses: small size + medium weight + uppercase + wide tracking + reduced opacity. The value uses: large size + semibold weight + tight tracking + full opacity. They occupy different typographic registers — you can tell what's a label and what's a value even without reading the text.

**Rule of thumb:** Labels and values should differ on at least 3 axes: size, weight, and one of (tracking, case, opacity).

---

### 12. Button Hierarchy Collapse

**Problem:** AI makes every button primary. A form has "Submit" and "Cancel" both as filled buttons. A page has three CTAs, all the same visual weight. Or worse, multiple gradient-filled buttons competing for attention on the same screen.

**The tell:** Count the primary-styled buttons visible on a single screen. More than one (two at absolute most) means the hierarchy has collapsed.

**Fix:** One primary action per screen or section. Supporting actions use secondary (outline) or ghost (text-only) variants. Destructive actions get a distinct treatment (red, or ghost + red text). The visual weight should match the action importance.

```jsx
{/* Primary: the one thing you should do */}
<Button>Deposit</Button>

{/* Secondary: the thing you could do */}
<Button variant="outline">View Details</Button>

{/* Ghost: the thing you probably won't */}
<Button variant="ghost" size="sm">Advanced Settings</Button>
```

---

### 13. Emoji as Design Element

**Problem:** AI uses emoji as visual elements — bullet points in feature lists, category markers in headings, status indicators in dashboards. This is the UI equivalent of AI writing's sycophantic opening exclamation marks. Emoji have no consistent rendering across platforms and can't be styled.

**The tell:** Emoji appearing in headings, list items, card labels, or as pseudo-icons throughout the interface.

**Fix:** If you need visual markers, use actual icons (styled to match the design system) or colored dots. If the emoji was serving as a bullet, remove it — the text doesn't need visual emphasis on every line. If it was communicating status, use a styled badge or indicator that you control.

---

## COMPONENTS & ELEMENTS

### 14. Uniform Border Radius

**Problem:** AI applies one radius value to everything. `rounded-2xl` on cards, buttons, inputs, badges, modals, tooltips, images. Real design systems have a radius scale with intent: small radius on inputs and badges (functional, compact), medium on cards (containment), large on modals or hero elements (rare, purposeful). When everything has the same generous radius, nothing has hierarchy.

**The tell:** Inspect 5 different element types. If they all use the same `border-radius` value, the radius wasn't designed — it was defaulted.

**Fix:** Define a radius scale tied to function:

| Element type | Radius | Why |
|---|---|---|
| Badges, chips, small tags | `rounded` (4px) or `rounded-full` | Compact, functional |
| Inputs, selects | `rounded-md` (6px) | Form convention — users expect crisp inputs |
| Buttons | `rounded-md` to `rounded-lg` (6-8px) | Match input radius in forms, slightly softer standalone |
| Cards, panels | `rounded-lg` to `rounded-xl` (8-12px) | Containment — larger elements get more rounding |
| Modals, hero elements | `rounded-xl` to `rounded-2xl` (12-16px) | Rare, prominent — the rounding itself signals importance |

The key is variance. Not every element at the same radius. Smaller, more functional elements get less rounding.

---

### 15. Decorative Icons

**Problem:** AI places an icon next to every heading, stat, or feature label. A chart icon next to "Analytics." A shield next to "Security." A lightning bolt next to "Performance." These icons don't encode data — they redundantly illustrate the word next to them. Removing any one of them loses zero information.

**The tell:** Cover every icon with your hand. Did the UI lose any information? If you can still understand everything, the icons are decorative.

**Fix:** Icons earn their place when they: encode data (green checkmark vs red X for status), provide navigation (menu icon, back arrow), or differentiate items in a list where text alone would create a wall. If the icon just illustrates the adjacent word, remove it. If you want visual interest in a stat card, use a micro-visualization that shows the metric's nature (sparkline for trends, gauge for capacity) instead of a generic icon.

---

### 16. Testimonial Trinity

**Problem:** Three testimonial cards in a row, each with a round avatar, name, title, and italicized quote. This layout is so specifically associated with AI generation and template sites that using it unironically damages credibility.

**The tell:** Three cards. Round avatars. Italicized quotes. Name + title below. If it also uses a star rating, it's the full template.

**Fix:** If social proof is genuinely needed, integrate it differently: a single prominent quote in a section break, logos of companies (if B2B), metrics ("trusted by X users"), or inline references within relevant content rather than a dedicated testimonial section.

---

## INTERACTION & STATE

### 17. Static/Theatrical Gap

**Problem:** AI output exists at two extremes with nothing in between. **Static:** no hover states, no transitions, no cursor feedback. Elements look the same whether you're hovering, clicking, or ignoring them. **Theatrical:** scroll-triggered counter animations, parallax backgrounds, stacking card transitions, GSAP timeline orchestrations. The middle ground — considered micro-interactions that communicate state — is almost never generated.

**The middle ground (what AI misses):**
- A table row that subtly highlights on hover (`bg-muted/50` transition over 150ms)
- A button that shifts background color on hover (not opacity, not scale, not gradient slide)
- A card that gains a slightly more visible border on hover
- A chart tooltip that follows the cursor smoothly at 60fps
- A sidebar item that shows an active state distinguishable from hover

**Fix:** Start with the small, meaningful interactions. Every interactive element should have a hover state. That hover state should be a subtle visual change appropriate to the element — not a universal `opacity-80` or `scale-105`. Scroll-triggered animations are the last thing to add, not the first.

---

### 18. Hover-as-Opacity

**Problem:** AI applies `hover:opacity-80` (or `hover:opacity-70`) as the universal hover effect. Buttons, cards, links, images — all dim on hover. This is lazy and creates a "fading" feel instead of an "activating" feel. Hovering should suggest "you can interact with this," not "this element is becoming less visible."

**Fix:** Hover effects should match the element type:

| Element | AI default | Better alternative |
|---|---|---|
| Button | `hover:opacity-80` | `hover:bg-primary/90` (subtle color shift) or lighter/darker variant |
| Card | `hover:opacity-90` | `hover:border-border/80` (border becomes more visible) or `hover:bg-muted/50` |
| Link | `hover:opacity-70` | `hover:text-primary` (color change) or underline transition |
| Icon button | `hover:opacity-80` | `hover:bg-muted rounded-md` (background appears) |
| Table row | nothing or `hover:opacity-95` | `hover:bg-muted/30` (subtle background) |

**Principle:** Hover should add visual information (color, background, border), not subtract it (opacity).

---

### 19. Loading/Empty State Gap

**Problem:** AI only generates the happy path — the component populated with ideal data. No skeleton loaders during data fetch, no empty state when there's no data, no error state when something fails, no edge cases (one item, hundreds of items, extremely long text). This is the most functionally significant AI pattern because it means the UI breaks visually in real use.

**The tell:** The component only has one visual state. There's no conditional rendering for loading/empty/error.

**Fix:** Every component that displays dynamic data should handle at minimum:
- **Loading:** Skeleton placeholder matching the content layout
- **Empty:** Clear message + optional action ("No deposits yet. Get started →")
- **Error:** Retry option + clear error description

This is the pattern that separates prototypes from production-ready components. AI almost never generates it because the prompt is always "build me X" (the happy path), never "build me X including what happens when there's no data."

---

## SPACING & RHYTHM

### 20. Uniform Spacing

**Problem:** AI uses the same spacing values everywhere — `gap-4` in every grid, `p-6` on every card, `space-y-4` between every section. The result has no spatial rhythm. Related elements should be closer together; unrelated sections should have more breathing room. Uniform spacing treats everything as equally related, which means nothing is grouped.

**AI-typical:**
```jsx
<div className="space-y-4">
  <h2>Market Overview</h2>     {/* 16px below */}
  <StatsGrid />                 {/* 16px below */}
  <h2>Interest Rate Model</h2> {/* same 16px — no section break */}
  <IRMChart />                  {/* 16px below */}
  <h2>Market Details</h2>      {/* same 16px — still no hierarchy */}
  <DetailsTable />
</div>
```

**Fix:** Use spacing as a hierarchy signal:

```jsx
<div>
  <section className="space-y-3">       {/* tight: heading + content are one group */}
    <h2>Market Overview</h2>
    <StatsGrid />
  </section>
  <section className="mt-10 space-y-3"> {/* large gap: new section */}
    <h2>Interest Rate Model</h2>
    <IRMChart />
  </section>
  <section className="mt-10 space-y-3">
    <h2>Market Details</h2>
    <DetailsTable />
  </section>
</div>
```

Within a section: tight spacing (12-16px). Between sections: generous spacing (40-64px). The ratio between intra-section and inter-section spacing should be at least 3:1.

---

### 21. Dark Mode as Inversion

**Problem:** AI implements dark mode by swapping black and white values. Light background becomes dark, dark text becomes light, done. This ignores that dark and light modes have fundamentally different visual needs: dark mode needs lighter font weights (text looks bolder against dark backgrounds), different surface layering (border-based separation instead of shadow-based), and adjusted contrast ratios.

**What changes between themes (that AI misses):**

| Property | Light mode | Dark mode |
|---|---|---|
| Card separation | Box shadow | Border or background color difference |
| Font weight for stats | `font-bold` | `font-semibold` (bold is too heavy on dark) |
| Table row separation | Alternating background | Subtle border-bottom |
| Surface hierarchy | White → gray-50 → gray-100 | zinc-950 → zinc-900 → zinc-800 |
| Muted text opacity | 60% | 50% (needs less to be visible on dark) |
| Accent color saturation | Full | Slightly desaturated (neon on dark is harsh) |

**Fix:** Define separate tokens for each theme, not just foreground/background swaps. Test each theme independently. A common shortcut: design dark first (if it's primary), then do a separate pass for light with attention to shadows, weight, and surface tinting.

---

## PROMPT AUTOPSY

Analysis of the Nura Health prompt uploaded this session, demonstrating how Layer 2 overcompensation manifests in real prompt engineering.

**Legitimate design decisions in the prompt:**
- Specific brand palette with hex values (not Tailwind defaults)
- Named font pairings with intentional contrast (sans vs serif italic)
- Clear hierarchy: data in monospace, emotion in serif italic, structure in sans
- Specific imagery direction (moody forest, organic textures)

**Layer 2 tells in the prompt:**
- "Global CSS Noise overlay (SVG turbulence at 0.05 opacity)" — noise-as-premium
- "rounded-[2rem] to rounded-[3rem] radius system for all containers" — uniform large radius
- "white/60 glassmorphic blur" on navbar — glassmorphism as default
- "magnetic feel (subtle scale-up on hover)" — performative micro-interaction
- GSAP ScrollTrigger stacking cards with blur + scale-down — theatrical scroll
- "Diagnostic Shuffler" cycling cards, "Telemetry Typewriter" feed, "Mock Cursor" animation — complexity as proof of sophistication

**The paradox:** The prompt's execution directive says "Eradicate all generic AI patterns" while prescribing a collection of patterns that have themselves become AI tells through overuse. The techniques individually are legitimate tools. Accumulated in a single page, they produce a site that signals "AI prompt trying to look handcrafted" instead of either "AI default" or "human-designed."

**What would make it genuine:** Pick two or three of these techniques. Apply them with restraint. The noise overlay OR the glassmorphism, not both. The scroll stacking OR the parallax textures, not both. Specificity means choosing, not accumulating.

---

## Reference

The two-layer framework (defaults vs overcompensation) parallels Wikipedia's observation about AI writing: "LLMs use statistical algorithms to guess what should come next. The result tends toward the most statistically likely result that applies to the widest variety of cases." Layer 1 is the most likely result. Layer 2 is the most likely result for prompts that say "don't give me the most likely result."

Community observations sourced from: developer forums noting Lovable/v0 output recognition at a glance, comparative testing showing three AI tools producing near-identical layouts from the same prompt, and design reviews identifying specific default patterns (shadcn, Tailwind palette, three-column grids) across AI-generated interfaces.
