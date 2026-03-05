---
name: aerarium-ui
description: "Read before any Aerarium frontend/UI work. Covers design direction, component conventions, and collaboration workflow. For detailed tokens, patterns, and component API specs, consult Reference_AerariumUI.md."
---

# Aerarium UI Development

Concise rules and conventions for frontend work on Aerarium. Read in full before starting any UI task.

## Design Direction

**North star:** Clean, institutional, trust-forward. Numbers-first, narrative-light. Think Aave's clarity with Morpho's charting polish — but Aerarium's leverage integration is the product differentiator that neither has.

**What this means in practice:**
- Data density is a feature, not a problem — but every element must earn its space
- No decorative icons that don't encode data — use micro-visualizations instead
- Typography hierarchy carries the UI — get font sizes right, everything else follows
- Dark theme, but institutional dark (muted, confident) not "hacker dark" (neon, aggressive)
- Brief contextual descriptions on earn/vault pages only; core market pages are numbers-only
- Info tooltips (ⓘ) for concept explanations — don't clutter the main view

## Component Architecture

### Splitting Convention

Every component splits into three concerns. This was established with the PositionHealth system and applies to all new components:

```
feature/
├── constants/       # Types, thresholds, color tokens — zero React, importable anywhere
├── components/      # Pure visual — receives data, renders UI. No business logic.
├── hooks/           # Logic — threshold detection, data transforms, notifications
└── index.ts         # Barrel exports
```

**Rules:**
- Components and hooks are siblings, never coupled — you can use one without the other
- Constants have zero React dependency — safe in server components, tests, utils
- `"use client"` directive on all components and hooks (Next.js requirement)
- Visual components receive data as props. They never fetch, compute, or subscribe.
- When a primitive appears in multiple scale contexts (e.g., stat cards vs chart headers), add a `size` prop with named tiers — don't compromise with a middle value that's wrong everywhere.
- When two primitives must pixel-align as siblings (e.g., DeltaBadge next to LiquidityBadge), both must be proper file-level primitives exported through the same barrel — inline components render with subtly different box models even with identical classes.
- Logic hooks emit structured payloads (not UI). Wire to your existing toast/notification system.
- Secondary CTAs need solid fills (`bgElevated` + `borderElement`), not ghost styling (`transparent` bg + `borderSubtle` border). Ghost buttons lose visual grounding when paired with filled/tinted cards — they float in the void instead of reading as interactive.

### File Naming

- Components: PascalCase `.tsx` — `HealthBar.tsx`, `InterestRateCurve.tsx`
- Hooks: camelCase with `use` prefix `.ts` — `useHealthNotifications.ts`
- Constants: camelCase `.ts` — `health.ts`, `chartTokens.ts`

## Charting Rules

### Chart Type Selection

| Data shape | Chart type | Example |
|---|---|---|
| Time series (deposits, borrows, TVL) | Area chart with gradient fill | Total Deposits over 30d |
| Rate over time (APY, APR) | Line chart, thin stroke, avg annotation | Supply APR 1w/1m/6m/1y |
| Utilization→rate relationship | Line with kink, interactive tooltip | Interest Rate Model |
| Projected earnings | Dual line (solid + dashed), shaded delta | With/Without Leverage |

**Never use:** Bar charts for time series (creates "picket fence" visual noise).
**Minimum data density:** Compound interest curves (leverage projections, earnings) need monthly-granularity data points even for multi-year views. Fewer than ~30 points makes exponential curves look angular.

### Unified Toggle Pattern

One chart, multiple views via toggle pills (not separate charts):
- `Borrow | Supply | Liquidity` for volume metrics
- `Token | USD` for denomination switching
- `1w | 1m | 3m | 1y` for time range (or dropdown for space efficiency)

Inspired by Morpho's toggle system. Reduces page length, adds interactivity.

### Axis & Label Standards

- Y-axis labels: right-aligned, properly formatted (`$155M` not `155700000` or `103043.804531870999M`)
- Use compact notation: `$1.2B`, `$340M`, `$45.2K`
- No more than 4-5 Y-axis gridlines
- X-axis: date labels at readable intervals, never overlapping
- Current value: large number above chart with delta badge (e.g., `$155.7M ▲ +3.2%`)

### Cross-Chart Consistency

All chart components (unified-chart, apy-chart, irm-chart) must share the same base styling: axis font sizes, grid stroke opacity, line strokeWidth, gradient fill opacity. When modifying any chart styling prop, propagate to all chart components and tab-switch to visually verify — divergence is invisible until you compare tabs side by side.

**Header structure contract:** Every chart tab header uses the same layout: 24px bold primary value + inline badge (DeltaBadge or status badge, `md` size) on the first row, token pills + context label on the second row. When adding a new chart tab, match this structure exactly — don't invent a different header layout even if the tab shows different data.

### Recharts Focus Outline

Recharts SVG elements grab focus on click, showing a browser outline. `outline: none` on the container div is insufficient — inner `<rect>`, `<g>`, `<svg>` elements have their own focus ring. Fix with a global CSS wildcard rule: `.recharts-wrapper, .recharts-wrapper * { outline: none !important; }` (in `styles/defaults.css`).

### Interest Rate Model (IRM)

- Show the utilization→rate curve with gradient fill under the line
- Mark "Current" and "Optimal" utilization as labeled vertical lines on the curve
- **Interactive tooltip on hover:** "Deposit $X more to reach Y% utilization (Z% borrow APR)" or "Borrow $X more to reach Y% utilization (Z% borrow APR)"
- Display Base Rate, Optimal Utilization, Max Rate below the chart
- Kink point should be visually prominent (where the curve steepens)

### Tooltip Standards

- Light background, dark text on dark theme charts (for contrast)
- Show all relevant values at hover point (utilization %, rate %, and the actionable amount)
- Smooth crosshair/vertical line following cursor
- No tooltip flicker — debounce hover position at ~16ms

## Stat Card Pattern

Replace decorative icons with micro-visualizations matched to each metric's nature:

| Metric nature | Micro-viz type | Example |
|---|---|---|
| Trend (changes over time) | Delta badge (▲ 2.8%) | Total Deposits, TVL |
| Capacity (proportion of a total) | LiquidityBadge (fill bar, health-coded) | Liquidity (% available) |
| Rate (current value + direction) | Delta badge (▲ 1.2%) | Supply APY, Borrow APR |
| Ratio (proportion of a maximum) | Mini ring gauge | Max LTV, Collateral Factor (in market info panels only) |
| Static config value | No viz — plain number | Oracle Price |

**Stat card badge rule:** All stat card micro-visuals use pill badge language (DeltaBadge or LiquidityBadge) with identical box models (`text-xs px-1.5 py-[3px] gap-0.5`). Ring gauges are reserved for market info panel capacity rows, not stat cards — circular shapes read as loading spinners at stat card scale.

**Rule:** If the micro-viz would render as a flat line or meaningless shape (e.g., sparkline for a config param that never changes), don't use one. Plain number is better than a misleading visual.

## Page Layout Principles

### Market Detail Page (top → bottom)

1. **Asset header** — pair icons, name, market identifier
2. **Stat cards row** — 3 cards with micro-viz (Total Deposits w/ sparkline, Available Liquidity w/ ring gauge, Deposit APY w/ delta badge)
3. **Unified chart** — area chart with Borrow/Supply/Liquidity toggle + time range
4. **Market Information** — per-asset Supply/Borrow stats in card grid
5. **Interest Rate Model** — interactive curve with tooltips
6. **Leverage Simulator** — behind tab or expandable section (power-user feature)

### Right Sidebar (protected layout)

The deposit/borrow action panel structure is established and protected:
- Asset selector with token icon
- Amount input with USD conversion + MAX button
- Denomination switching (which token to pay in)
- Leverage slider (1x → max)
- Position summary (market, vAPY, projected earnings, borrowing eligibility, health)
- Action button (Deposit / Borrow)

Do not restructure this layout without explicit discussion.

### Slider Implementation

**Never use controlled `<input type="range">`** in React. Browser native positioning fights React reconciliation after click-to-position, causing deadlocks. Use custom `mouseDown`/`mouseMove`/`mouseUp` on a track div instead. Store numeric input values (leverage, amounts) as strings with `parseFloat` derivation — allows intermediate typing states ("5." → "5.5"). Clamp on blur.

### Button Hierarchy

- **Primary CTA:** Solid `#644AEE`, hover `#6B59E5`, no gradient, no shadow (institutional flat)
- **Secondary CTA:** Solid `bgElevated` (#282828) fill + `borderElement` border. Never `transparent` — ghost buttons lack visual grounding when paired with a filled/tinted card.

## Position Health

### Visual

- Segmented capsule bar (red→orange→yellow→green gradient, 20 segments)
- Three layout variants: sidebar row (compact), circular gauge (cards), expanded bar (detail page)
- Animated transitions between states with staggered segment delays
- Glow effect on leading edge when health ≤ 50%

### Notifications

- Threshold crossings at 75% (caution), 50% (warning), 25% (critical) fire toast notifications
- Recovery notifications when climbing back above a threshold
- Logic lives in `useHealthNotifications` hook — wire `onNotification` to your toast provider
- Debounce at 2000ms to prevent spam on oscillating values
- Thresholds configurable per-instance (different markets may have different risk profiles)
- **Note:** 75/50/25 are component defaults. V1 audit (Reference → V1 Site Audit → Health Severity Mismatch) proposes recalibration to protocol-specific values. Confirm mapping to actual liquidation curve before production.

## Color Palette

Aerarium supports **light and dark themes** — both are first-class. Brand accent is purple/black. All color tokens must be defined for both themes using CSS custom properties or Tailwind `dark:` variants.

**Never hard-code a single theme's values.** Always reference token names.

Dark institutional theme is the primary design surface. Light mode is not an inversion — it requires its own design pass (card shadows, bolder weights for stat numbers, tinted surfaces for table row separation).

Specific hex values for both themes in Reference_AerariumUI.md → Color Tokens.

**Semantic color usage (same in both themes):**
- Green (`#4ade80` family) — supply-side values, healthy states, Deposits section headers
- Red/pink (`#f87171` family) — negative values, danger states, critical health
- Purple/indigo (`#644AEE` Majorelle Blue) — structural/navigational: stat card labels, section accent borders, active toggles, chart lines, tab underlines. Purple is the primary structural color (like Bloomberg's amber), not just an accent.
- Steel blue (`#7B9EC8`) — borrow-side values, Borrow section headers, borrow charts
- Amber (`#fbbf24` family) — warning states, caution tier
- Muted gray — configuration data (Collateral section headers, metric labels)
- White — all data values. Stat cards, metric rows, and position summaries use white for numbers regardless of sentiment. Color on values is reserved for rate comparisons inside market info sections.
- Text at varying opacity — hierarchy via opacity (see Reference for per-theme values)

**Color system principle:** Color encodes *role*, not just sentiment. Every colored element should answer "why this color?" with a structural reason (navigational anchor, supply-side, borrow-side, configuration), not just "it's positive/negative."

## v1 Codebase Constraints

All v1-specific rules (static export, yarn-only, module split, Tailwind dual color systems, non-standard breakpoints, Windows path restrictions, Node 18+, Vercel deploy) are maintained in `Skill_CurvanceV1.md` → Hard Constraints, Module Architecture, Tailwind Token System. Load that skill for any v1 codebase work.

## Where I Go Wrong (v1 Codebase)

V1 codebase gotchas (dynamic routes, yarn-only, hook ordering, Vercel deploy, barrel exports, DevTools selectors, sed restructuring) are maintained in `Skill_CurvanceV1.md` → Where I Go Wrong. Load that skill for any v1 codebase work.

## Tooltip System

Three distinct tooltip patterns, carried forward from v1 with visual polish:

**APY Breakdown:** Hover on APY values shows full yield source decomposition (native rate + per-token rewards + points = Net APY). Required on all APY/vAPY displays.

**Capacity:** Hover on deposit/liquidity amounts shows current value and remaining cap/room. Directly actionable — user sees how much more they can deposit/borrow.

**Educational (ⓘ):** Hover on column header icons shows concise explanation of the metric. Keep text short, link to docs for full context. Required on all column headers and any non-obvious metric labels.

### Tooltip Implementation Rules

- **Positioning:** `position: relative` goes on the outer row div, never on inner left/right child divs. All tooltips render as direct children of the row and anchor `left: 0`.
- **Sizing:** Intrinsic width with `minWidth: 180`. Never stretch with `left: 0; right: 0` — causes inconsistent sizes between simple and complex tooltips.
- **Dividers inside tooltips:** Use `rgba(255,255,255,0.1)`, NOT theme border tokens (`borderSubtle`/`borderElement`). Theme tokens are invisible on glassmorphism `rgba(32,32,32,0.85)` backdrops.
- **Title hierarchy:** 11px semibold uppercase tracked (`letterSpacing: 0.04em`, `color: T.textSecondary`). Must be visually heavier than 12px content rows below.
- **Color context:** Reward/net values use contextual color — green (`T.positive`) for deposit, steel blue (`T.accentSecondary`) for borrow. Never hardcode green.
- **Terminology:** "Filled" not "Used" for cap consumption ("The USDC cap is filled").

## Collaboration Workflow

### Mode 1: Standalone Component Development (new components)

1. Reference existing designs (Figma site, Aave, Morpho) for context
2. Build components as React artifacts in conversation — iterate visually
3. **When a visual doesn't land:** Build a single artifact with 5-8 alternatives side by side (wide exploration), then a second artifact narrowing the top 2-3 (focused refinement). Faster than iterating one-at-a-time and prevents anchoring on the first attempt.
4. Split into integration-ready modules (constants/components/hooks)
5. Package with INTEGRATION.md for handoff to frontend codebase
6. Zip or batch deliver at session end

### Mode 2: v1 Codebase Modification (explore page, market detail page)

1. Load `Skill_CurvanceV1.md` — contains module map, hard constraints, WIGGW. Reference lookup via its pointer table.
2. Open GitHub repo (curvance-web/app, branch: dev) in browser for source verification
3. Identify exact files and import paths before proposing changes
4. Build artifacts that match existing patterns (Tailwind `new-*` tokens, Radix primitives, zustand stores)
5. **MCP limitation:** Claude in Chrome cannot inspect localhost. Use Vercel deployment URL for Claude visual inspection, Chris iterates on localhost directly.

### Mode 3: Artifact → Deployment Pipeline (multi-file integration)

When deploying a full artifact (many components) into v1 codebase:
1. Build artifact in conversation first (Mode 1)
2. Generate file-creation script (PowerShell for Windows) embedding all files
3. Chris runs script locally → `yarn install` → `yarn build` to verify
4. Fix compile errors iteratively (import paths, prop names)
5. **Replace artifact patterns with codebase patterns.** Artifact prototypes use inline SVG components (`WethIcon`, `UsdcIcon`), hardcoded data, and standalone color tokens. Production code uses the `Icon` component from the codebase registry, SDK data, and `new-*` Tailwind tokens. Don't carry artifact shortcuts into production.
6. Push to GitHub → gas-limit triggers Vercel deploy
7. Claude inspects via Vercel URL, Chris iterates on localhost

### What NOT to do

- Don't copy Aave or Morpho wholesale — use as reference, build unique
- Don't add animations without purpose — every motion should communicate state change
- Don't use decorative icons — if it doesn't encode data, it doesn't belong
- Don't build full pages — build isolated components that compose into pages

### Session Handoff Rules

Handoff docs are **cumulative** — each new handoff must merge forward, not replace. At session end:

1. Read the previous handoff doc first
2. Identify unresolved items (known issues, pending decisions, open questions) that are still unresolved
3. Forward-propagate them into the new handoff — don't silently drop context
4. Mark items resolved only when actually completed or explicitly abandoned by Chris
5. New handoff supersedes old — user should only need to upload the latest one

This prevents context loss across session boundaries. A dropped TODO is a silent regression.

## Reference Lookup

**File:** `Reference_AerariumUI.md` (442 lines)

| Section | Lines | Description |
|---|---|---|
| V1 Site Audit | 304-408 | Preserve/improve/drop decisions from app.curvance.com review (104 lines, all design rationale) |
| Color Tokens | 7-68 | Hex values for both themes — background layers, text hierarchy, semantic colors, brand |
| Component APIs | 140-188 | Established component specs and prop interfaces |
| Micro-Visualizations | 97-139 | Sparkline, ring gauge, bar, delta badge implementation |
| Platform Comparisons | 262-303 | Competitive analysis (Aave, Morpho, Compound) |
| Charting Patterns | 189-229 | Recharts library patterns and conventions |
| Established Components | 409-437 | Built component inventory + file paths |
| Typography | 69-96 | Type scale for both themes |
| Style Migration | 243-261 | Inline → Tailwind class mappings |
| Terminology Conventions | 230-242 | "Filled" not "used," "supply" vs "deposit" |
| WIGGW | 438-442 | Un-promoted gotchas staging area (currently empty) |

**Cross-references:**

| Topic | File |
|---|---|
| v1 codebase architecture, module map, queries | Skill_CurvanceV1.md + Reference_CurvanceV1.md |
