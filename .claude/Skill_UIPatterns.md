---
name: ui-patterns
description: "Use when building, reviewing, or critiquing any frontend UI — React artifacts, HTML pages, component prototypes, landing pages, dashboards. Triggers: 'make this look less AI', 'this looks generic', 'review the design', 'improve the UI', any visual component work, any artifact creation involving layout or styling. Also use when evaluating AI-generated UI output from tools like v0, Lovable, Bolt, or Claude artifacts. Load Reference_UIPatterns.md alongside for the full pattern catalog with code examples. Do NOT use for backend code, API design, or non-visual work."
---

# UI Pattern Detection

Rules for identifying and avoiding AI-generated UI patterns. Read in full before any frontend work. Works standalone for any project; compose with domain-specific design skills (e.g., Skill_AerariumUI.md) for project work.

**Before adding to this file:** Pattern must be observable across multiple AI tools, specific enough to detect mechanically, and fixable with a concrete alternative. Vibes and preferences don't qualify.

## Core Principle

AI-generated UI converges on the statistically safest layout for the widest range of use cases. The result is recognizable the same way AI prose is: not because any single choice is wrong, but because every choice is the default. A rounded corner is fine. Every corner at the same radius is a tell.

**Two layers of tells:**

**Layer 1 — Defaults.** What AI produces with a basic prompt. Shadcn out-of-the-box, Tailwind palette colors, `rounded-2xl` on everything, three-column grids, `shadow-lg` on every card. These are the "Additionally," of UI.

**Layer 2 — Overcompensation.** What AI produces when the prompt says "make it premium" or "no generic patterns." Glassmorphism, SVG noise overlays, GSAP scroll theatre, parallax textures, magnetic hover effects, bento grids. These read as "AI trying to look handcrafted." Experienced eyes spot them just as fast.

**The fix for both layers is the same: specificity rooted in purpose.** A border radius is 4px because the input is functional, or 16px because the card groups comparable items. A scroll animation exists because the content relationship benefits from progressive reveal. Not because "every scroll should feel intentional."

## Detection Heuristic

When reviewing any UI (your own or generated), run this three-question filter on each element:

1. **Why this value?** Can you explain why this specific radius / padding / shadow / color was chosen for *this* element, not just "it looks good"? If the answer is "it's what the tool gave me" or "it matches everything else," it's a default.
2. **Does it earn its space?** Would removing this element (icon, gradient, card wrapper, animation) lose information or functionality? If not, it's decoration.
3. **Is it the same everywhere?** Same radius, same shadow, same spacing, same hover effect across unrelated elements? Uniformity is the single strongest AI tell.

## Pattern Categories

21 patterns across 6 categories. Brief descriptions below; full analysis with code examples in Reference_UIPatterns.md.

### Layout & Composition (patterns 1-6)

| # | Pattern | The tell |
|---|---------|----------|
| 1 | Card-in-card recursion | Everything wrapped in cards. Cards inside cards. Settings page = card containing grid of cards containing form fields |
| 2 | Grid of three | Three feature cards, three stats, three testimonials. Always three columns because it's balanced and safe |
| 3 | Information density allergy | Massive padding, one metric per card, acres of whitespace. The opposite of professional data-dense UIs |
| 4 | Bento grid | Asymmetric card mosaic (one tall, two short, one wide) on landing pages. Was trendy, now an AI signal |
| 5 | Hero section formula | Big heading + subtitle + two buttons (primary + ghost) + abstract background. Every AI landing page |
| 6 | Form-as-card-stack | Each form group gets its own card instead of flowing naturally within a single container |

### Surface & Color (patterns 7-10)

| # | Pattern | The tell |
|---|---------|----------|
| 7 | Tailwind default palette | `indigo-500`, `purple-600`, `gray-900`. No custom brand work — colors from the starter template |
| 8 | Meaningless gradients | Gradient fills on buttons, backgrounds, text for "visual interest" that encodes zero information |
| 9 | Shadow and blur overuse | `shadow-lg` on every card, `backdrop-blur-xl` glassmorphism. Depth via drop shadow instead of surface color |
| 10 | Noise texture overlay | SVG turbulence at low opacity as a "premium" texture. The Layer 2 overcompensation poster child |

### Typography & Hierarchy (patterns 11-13)

| # | Pattern | The tell |
|---|---------|----------|
| 11 | Typography flatness | Hierarchy only through font size. No weight, tracking, opacity, or case variation between elements |
| 12 | Button hierarchy collapse | Every button is primary. Or multiple gradient CTAs competing on the same screen |
| 13 | Emoji as design element | Emoji bullets in feature lists, emoji in headings, emoji as category markers |

### Components & Elements (patterns 14-16)

| # | Pattern | The tell |
|---|---------|----------|
| 14 | Uniform border radius | One radius for everything — inputs, cards, badges, modals, buttons all `rounded-2xl` |
| 15 | Decorative icons | A Lucide icon next to every heading or stat. Shield for "Security," chart for "Analytics." Fills space, encodes nothing |
| 16 | Testimonial trinity | Three cards in a row: round avatar, name, title, italicized quote. Always three. Always this layout |

### Interaction & State (patterns 17-19)

| # | Pattern | The tell |
|---|---------|----------|
| 17 | Static/theatrical gap | Either zero hover states and transitions, OR performative scroll animation (counters, parallax, stacking). No meaningful middle ground |
| 18 | Hover-as-opacity | `hover:opacity-80` on everything instead of considered, element-appropriate state changes |
| 19 | Loading/empty state gap | Only the happy path rendered. No skeletons, no error states, no empty states, no edge cases |

### Spacing & Rhythm (patterns 20-21)

| # | Pattern | The tell |
|---|---------|----------|
| 20 | Uniform spacing | `gap-4` and `p-6` everywhere. Same padding on every card, same gap in every grid. No spatial rhythm |
| 21 | Dark mode as inversion | Swap black↔white, call it done. No surface redesign, no weight adjustment, no contrast rethinking |

## Mandatory Review Checklist

Run on every UI artifact or component before presenting. No exceptions.

### Per-element checks
- [ ] No element uses the same border radius as every other element (radius varies by function)
- [ ] No decorative icons that don't encode data or provide navigation
- [ ] No gradient on interactive elements (buttons, inputs) unless the gradient communicates state
- [ ] Every card wrapper is justified — would a borderless group or simple divider work instead?
- [ ] Hover states exist on interactive elements AND are not just opacity changes
- [ ] At least one non-happy-path state considered (loading, empty, or error)

### Per-composition checks
- [ ] Layout is not three equal columns unless the content genuinely has three parallel items
- [ ] Spacing varies between sections (tighter grouping for related elements, more air between sections)
- [ ] Typography uses at least 2 axes of variation (size + weight, size + opacity, size + tracking)
- [ ] Color palette includes at least one custom value not from Tailwind's default set
- [ ] No card-in-card nesting without explicit justification

### Per-page checks
- [ ] No hero section that matches the formula (heading + subtitle + two buttons + abstract bg) without deliberate variation
- [ ] Dark/light mode aren't simple inversions — surfaces, weights, and contrast differ between themes
- [ ] Animations communicate state change or content relationship, not just "premium feel"
- [ ] Information density matches the audience (data-heavy for professional tools, not one-metric-per-card)

### Fix process
If any check fails, fix before presenting. Do not narrate the checklist. Fix and present clean output.

## Applying to Prompts

When writing prompts for AI UI generation (for yourself or others), avoid these prompt patterns that trigger generic output:

| Prompt pattern | Why it fails | Better alternative |
|---|---|---|
| "Make it look premium/professional" | Triggers glassmorphism, noise, scroll theatre | Describe the specific visual qualities: "Muted surfaces, tight typography, high data density" |
| "Modern dark theme" | Triggers neon-on-black, gradient cards | Specify the mood: "Institutional dark — charcoal backgrounds, low-contrast borders, no glow effects" |
| "Add animations" | Triggers scroll-triggered counters and stacking cards | Name the specific interaction: "Tooltip follows cursor smoothly with 16ms debounce" |
| "Eradicate all generic AI patterns" | Triggers Layer 2 overcompensation | Name specific patterns to avoid and specific qualities to achieve |
| "Clean, minimal" | Triggers information density allergy | "Dense but organized — Bloomberg terminal, not Apple marketing page" |

## Where I Go Wrong

| Trigger | Wrong | Right |
|---------|-------|-------|
| Need an SVG icon | Generate path data from scratch — parametric paths render garbled 90% of the time | Copy exact paths from Lucide, Heroicons, or Phosphor. For brand icons, extract from Figma export or source repo. Never synthesize SVG path data. |
| DOM extraction fails 2-3× | Keep trying with different selectors, position-based filters, path-length heuristics — spirals into 20+ min rabbit hole | Abandon after 3 attempts. Icons in React apps may be image-based, in portals, or icon fonts. Use a library icon or ask the user for the source file. |

## References

**File:** `Reference_UIPatterns.md` (447 lines)

| Section | Lines | Description |
|---|---|---|
| Layout & Composition (1-6) | 25-155 | Card recursion, content-free chrome, scroll theatre, gradient abuse, spacing allergy, nav inflation (130 lines, all behavioral with code examples) |
| Surface & Color (7-10) | 156-206 | Dark mode glow, contrast policing, glassmorphism, shadow stacking |
| Typography & Hierarchy (11-13) | 207-266 | Weight inflation, label/value inversion, all-caps abuse |
| Components & Elements (14-16) | 267-308 | Badge proliferation, icon decoration, input padding |
| Interaction & State (17-19) | 309-358 | Hover excess, loading skeletons, animation defaults |
| Spacing & Rhythm (20-21) | 359-418 | Padding uniformity, gap accumulation |
| Prompt Autopsy | 419-442 | Nura Health case study — prompt→output analysis |
| Layer Framework | 13-24 | The 3-layer detection model |
