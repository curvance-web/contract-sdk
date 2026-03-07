---
name: aerarium-ui
description: "Use when building, reviewing, or styling any Curvance/Aerarium frontend UI — React artifacts, components, market pages, dashboards, stat cards, charts. Triggers: 'market detail page', 'build a component', 'design the sidebar', 'chart styling', 'stat card', 'color tokens', any visual work on app.curvance.com. Compose with Skill_CurvanceApp.md for v1 codebase conventions and Skill_UIPatterns.md for anti-pattern detection. Do NOT use for Solidity/protocol work, backend, or Aerarium v2 clean-slate frontend."
---

# Aerarium UI Development

Rules and conventions for frontend work on Aerarium. Read in full before starting any UI task.

## Design Direction

**North star:** Clean, institutional, trust-forward. Numbers-first, narrative-light. Think Aave's clarity with Morpho's charting polish — but Aerarium's leverage integration is the product differentiator that neither has.

**What this means in practice:**
- Data density is a feature, not a problem — but every element must earn its space
- No decorative icons that don't encode data — use micro-visualizations instead
- Typography hierarchy carries the UI — get font sizes right, everything else follows
- Dark theme, but institutional dark (muted, confident) not "hacker dark" (neon, aggressive)
- Brief contextual descriptions on earn/vault pages only; core market pages are numbers-only
- Tooltips via dotted-underline affordance on labels — don't clutter the main view. ⓘ icons phased out; use `borderBottom: '1px dotted rgba(255,255,255,0.18)'` on labels. Mobile: tap to show.

## Brand Identity (cross-reference)

Curvance operates two visual identity tiers: Institutional (Tier 1) for protocol, lander, partner materials, and Engagement (Tier 2) for games, social, community. Full brand rules in `Skill_CurvanceBrand.md`. Key rule: never cross-pollinate tiers without explicit discussion.

## Mobile-First Light Mode

Figma mobile designs use **light mode as the primary surface**, contradicting the dark-first assumption in v1 desktop builds. All new mobile components must design light mode first, dark mode as variant. Desktop remains dark-first. Components shared between desktop and mobile need both themes tested. Notification panel, task accordion, and onboarding tour have explicit light and dark variants in Figma.

## Component Architecture

### Splitting Convention

Every component splits into three concerns (established with PositionHealth, applies to all):

```
feature/
├── constants/       # Types, thresholds, color tokens — zero React, importable anywhere
├── components/      # Pure visual — receives data, renders UI. No business logic.
├── hooks/           # Logic — threshold detection, data transforms, notifications
└── index.ts         # Barrel exports
```

**Rules:**
- Components and hooks are siblings, never coupled — use one without the other
- Constants have zero React dependency — safe in server components, tests, utils
- `"use client"` directive on all components and hooks (Next.js requirement)
- Visual components receive data as props. They never fetch, compute, or subscribe.
- Multi-scale primitives get a `size` prop with named tiers — don't compromise with a middle value
- Sibling primitives that must pixel-align (e.g., DeltaBadge next to LiquidityBadge) must both be file-level primitives exported through the same barrel — inline components differ subtly in box model
- Logic hooks emit structured payloads (not UI). Wire to your toast/notification system.
- Secondary CTAs need solid fills (`bgElevated` + `borderElement`), not ghost styling. Ghost buttons lose visual grounding when paired with filled/tinted cards.

### File Naming

Components: PascalCase `.tsx`. Hooks: camelCase `use` prefix `.ts`. Constants: camelCase `.ts`.

## Charting Rules

| Data shape | Chart type | Example |
|---|---|---|
| Time series (deposits, borrows, TVL) | Area chart, `type="linear"`, gradient fill | Total Deposits over 30d |
| Rate over time (APY, APR) | Area chart, `type="linear"`, avg reference line with pill label | Supply APR 1w/1m/6m/1y |
| Utilization→rate relationship | Line with kink, interactive tooltip | Interest Rate Model |
| Projected earnings | Dual line (solid + dashed), shaded delta | With/Without Leverage |

**Never use** bar charts for time series. **Minimum data density:** ≥30 data points for exponential curves.

**Controls:** Time Range Pills (single-select, underline accent, left-aligned above chart). Series Legend Toggles (multi-select, `Set<string>`, min-1-active, colored line + label + value). Token Selector (single-select, opacity-based: active `0.9`, inactive `0.3`).

**Axis standards:** Y-axis left-aligned, compact notation (`$1.2B`, `$340M`), max 4-5 gridlines. X-axis at readable intervals, never overlapping. Current value: large number above chart with delta badge.

**Consolidation:** Don't give single-series charts their own tab. Merge related series into composites with shared controls. Tabs for different chart types, not different series of the same type.

**Cross-chart consistency:** All charts share `chart-utils.ts` tokens: `CHART_AXIS_STYLE`, `CHART_GRID_STROKE`, `CHART_CURSOR`. Header layout: Row 1 = time range Pills. Row 2 = token selector left + legend toggles right. Use `syncId` for stacked charts sharing X-axis; lift time range state to parent; use `evenTicks()` for consistent spacing.

IRM spec, Recharts focus outline fix, and chart tooltip standards in Reference → Charting Patterns.

## Stat Card Pattern

### Earnings Display Format

Wherever earnings are displayed: **APY promoted as primary → earnings inline as secondary → boost % inline after earnings.** Example: `20.00% +$2.0K/year (+74%)`. This order applies everywhere — don't invert even if the dollar amount feels more impactful.

### Micro-Visualization Selection

| Metric nature | Micro-viz type | Example |
|---|---|---|
| Trend (changes over time) | Delta badge (▲ 2.8%) | Total Deposits, TVL |
| Capacity (proportion of total) | LiquidityBadge (fill bar, health-coded) | Liquidity (% available) |
| Rate (current value + direction) | Delta badge (▲ 1.2%) | Supply APY, Borrow APR |
| Ratio (proportion of maximum) | Donut gauge (% inside) | Collateral cap, Borrow cap (market info panels only) |
| Static config value | No viz — plain number | Oracle Price |

**Badge rule:** All stat card micro-visuals use pill badge language with identical box models (`text-xs px-1.5 py-[3px] gap-0.5`). Ring gauges reserved for market info capacity rows — circular shapes read as loading spinners at stat card scale. If the micro-viz would render flat or meaningless, use plain number.

## Page Layout Principles

### Information Grouping: Decision Context, Not Protocol Concept

Organize data by what the user is deciding, not protocol categories:

| Tier | Decision context | Contains |
|---|---|---|
| Rates | "What do I earn / pay?" | Deposit APY, Borrow APR |
| Activity | "Is this market worth entering?" | Total deposits, available liquidity |
| Capacity | "Will my position stress the pool?" | Collateral filled, borrow filled with fill % |

### Market Detail Page (top → bottom)

1. **Asset header** — pair icons, name, market identifier
2. **Stat cards row** — 3 cards with micro-viz
3. **Unified chart** — area chart with series toggle + time range
4. **Market Information** — per-asset Supply/Borrow stats in card grid
5. **Interest Rate Model** — interactive curve with tooltips
6. **Leverage Simulator** — behind tab or expandable (power-user feature)

### Right Sidebar (protected layout)

Asset selector → amount input with USD conversion + MAX → denomination switching → leverage slider (1x → max) → position summary → action button. Do not restructure without explicit discussion. **Never use `<input type="range">`** — use `DragSlider` from `@/components/v2-primitives`.

### Button Hierarchy

- **Primary CTA:** Solid `#644AEE`, hover `#6B59E5`, no gradient, no shadow
- **Secondary CTA:** Solid `bgElevated` (#282828) fill + `borderElement` border. Never `transparent` ghost styling

## Position Health

- Segmented capsule bar (red→orange→yellow→green, 20 segments), three layout variants (sidebar row, circular gauge, expanded bar), animated transitions with staggered delays, glow on leading edge when ≤ 50%
- Threshold notifications at 75% (caution), 50% (warning), 25% (critical) via `useHealthNotifications` hook. Recovery notifications when climbing back. Debounce 2000ms. Thresholds configurable per-instance.
- **Note:** 75/50/25 are defaults. V1 audit proposes recalibration — confirm mapping to liquidation curve before production.

## Color Palette

Both light and dark themes are first-class. **Never hard-code a single theme's values.** Reference token names. Dark institutional theme is primary design surface. Light mode requires its own design pass.

**Tier awareness:** Colors below apply to Tier 1 (institutional) only. Tier 2 uses its own saturated palette.

**Semantic color rules (both themes):**
- Green (`#4ade80`) — supply-side: deposits, collateral, deposit APY, healthy states
- Burnt sienna (`#CC6B5A`) — borrow-side: borrows, borrow APR, debt. Distinct from error red
- Blue (`#60a5fa`) — derived/neutral: liquidity, informational links. Third lane for derived metrics
- Red/pink (`#f87171`) — UI error and critical health ONLY. Never for borrow data
- Purple/indigo (`#644AEE`) — structural/navigational ONLY: tabs, CTAs, active states. Never on data elements
- Amber (`#fbbf24`) — warning states, caution tier
- White — all non-rate data values. Color on values reserved for rates only

**Color principle:** Color encodes *role*, not sentiment. Every colored element answers "why this color?" with a structural reason.

Hex values for both themes in Reference → Color Tokens.

## Surface Hierarchy

**Flat surface principle:** Cards float on page bg (`#0e1015`). No outer containers wrapping card groups.

**Opacity tokens over named tokens:** Card surfaces use `bg-white/[0.03]` + `border-white/[0.06]`, not `bg-new-elements`. Named tokens reserved for sidebar (intentionally elevated surface).

### Border Vocabulary

| Purpose | Value |
|---|---|
| Section dividers | `border-white/[0.04]` |
| Card borders (resting) | `border-white/[0.06]` |
| Card borders (hover/active) | `border-white/[0.08]` to `border-white/[0.1]` |
| Card header internal divider | `border-white/[0.08]` |
| Tab accent underline | `border-b-new-accent` (structural purple) |
| Tooltip internal dividers | `rgba(255,255,255,0.1)` (NOT theme tokens) |

Check this table before adding new surfaces or dividers. Don't invent new opacity values.

## Token Icons

**Sourcing priority:** (1) Morpho CDN (`cdn.morpho.org/assets/logos/{token}.svg`) — native vector, best quality. (2) TrustWallet assets — PNG, needs SVG wrapping + circular clip. (3) Existing codebase — only for Curvance-specific tokens.

**Rules:** Consistent `width="100%" height="100%"` viewBox. Circular clipping on PNGs. Globally unique internal SVG IDs (`clip-usdc`, `grad-eth`). Files in `assets/markets/primitive-assets/`. New tokens need barrel registration in `snippets-tsx/icon-selector/type/index.ts`.

Full pipeline in Reference → Token Icon Pipeline.

## Collaboration Workflow

### Standalone Component Development

1. Reference existing designs (Figma, Aave, Morpho) for context
2. Build components as React artifacts — iterate visually
3. **When a visual doesn't land:** 5-8 alternatives side by side (wide exploration) → narrow top 2-3 (focused refinement)
4. Split into integration-ready modules (constants/components/hooks)
5. Package with INTEGRATION.md for handoff

**What NOT to do:** Don't copy Aave/Morpho wholesale. No purposeless animations. No decorative icons. Build isolated components, not full pages.

V1 codebase modification workflow and artifact→deployment pipeline in Reference → Deployment Pipeline. v1 codebase constraints and conventions in `Skill_CurvanceApp.md`.

### Session Handoff Rules

Handoff docs are **cumulative** — merge forward, not replace. Read previous handoff first, forward-propagate unresolved items, mark resolved only when completed or explicitly abandoned. A dropped TODO is a silent regression.

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| Building mobile components | Assume dark mode primary (matching desktop) | Mobile is light-mode-first per Figma. Build light first, dark as variant |
| Designing a celebration/achievement UI | Use minimal institutional style | Celebration modals use radial burst backgrounds, large icons — engagement-tier energy is acceptable outside `/bytes` |
| Notification panel on mobile | Render as dropdown overlay (desktop pattern) | Mobile uses full-width bottom sheet with footer actions |
| Adding clickable links inside tooltips | `pointer-events-none` (blocks clicks) or wrapper div (breaks positioning) | Pass `onMouseEnter`/`onMouseLeave` to Tooltip. `pointer-events: auto` conditionally when handlers provided. No wrapper divs |
| Tooltip content inherits parent text-transform | Uppercase label makes tooltip ALL CAPS | `<span style={{ textTransform: 'none', letterSpacing: 'normal' }}>` to reset |
| Adding a new token icon SVG | Drop file and assume it works | Also need `import` + map entry in `snippets-tsx/icon-selector/type/index.ts` barrel |
| Fetching icon images in container | `wget`/`curl` — container network disabled | Browser MCP: canvas extraction + `toDataURL()`. Staggered `<a download>` as fallback |
| Adding a card to market detail page | Named tokens or outer card wrapper | Opacity tokens (`bg-white/[0.03]`, `border-white/[0.06]`). No outer containers. Named tokens = sidebar only |
| Adding dividers inside tooltips | Theme border tokens (`borderSubtle`, `borderElement`) | `rgba(255,255,255,0.1)` — theme tokens invisible on glassmorphism backdrop |
| Styling a Recharts chart | `outline: none` on container | Global CSS: `.recharts-wrapper, .recharts-wrapper * { outline: none !important; }` |
| Tailwind opacity modifiers (`bg-new-success/15`) | Expect them to work | Fail silently — colors defined as raw hex. Workaround: inline `style={{ background: 'rgba(...)' }}` |

Brand tier confusion (mascot on institutional pages, logo misuse, wrong purple) → `Skill_CurvanceBrand.md` → Where I Go Wrong.

## Reference Lookup

**File:** `Reference_AerariumUI.md` (~805 lines)

| Section | Lines | Description |
|---|---|---|
| Color Tokens | 7-73 | Hex values for both themes — background layers, text hierarchy, semantic colors, chart gradients |
| Typography | 74-101 | Type scale for both themes (input font responsive via v2-formatters) |
| Micro-Visualizations | 102-164 | DonutGauge, ContextTooltip + TipRow/TipDivider, TooltipShell, LiquidityBadge, DeltaBadge |
| Component APIs | 165-213 | HealthBar, CircularGauge, useHealthNotifications prop interfaces |
| Charting Patterns | 214-283 | Chart-utils tokens, area chart template, avg pill label, toggle implementation, IRM spec, Recharts focus fix (69 lines, all behavioral — high ROI) |
| Terminology Conventions | 284-300 | APY/APR, rate labels, "Remaining" for caps, "Available" for liquidity |
| Style Migration (Inline → Tailwind) | 301-319 | Inline → Tailwind class mappings |
| Platform Comparisons | 320-361 | Competitive analysis (Aave, Morpho, Compound) |
| V1 Site Audit (app.curvance.com) | 362-470 | Preserve/improve/drop decisions (108 lines, all design rationale) |
| Established Components | 471-510 | Built component inventory + file paths |
| Brand Assets | 511-516 | Brand asset references |
| Partner Badge System | 517-522 | Badge visual specs |
| Notification Panel Patterns | 523-581 | Three-tab architecture, task accordion states, desktop/mobile, light/dark |
| Onboarding Tour Patterns | 582-627 | Guided tour step inventory, acceptance criteria |
| Token Icon Pipeline | 628-708 | TrustWallet URLs, SVG wrapper template, canvas extraction, icon inventory |
| Rejected Explorations | 709-728 | Dead ends — prevents re-exploring stacked area charts, fonts, pills, borrow colors |
| Market Info Typography | 729-747 | Font sizes/weights for market info card elements |
| WIGGW (What I Got Wrong / Weird) | 748-755 | Accumulated gotchas not yet promoted to Skill files |
| Tooltip System | 756-780 | Combined tooltip pattern, APY/capacity/stat card specs, implementation rules |
| Deployment Pipeline | 781-805 | Artifact→v1 codebase integration: script generation, compile fixes, pattern replacement |

**Cross-references:**

| Topic | File |
|---|---|
| v1 codebase architecture, module map, queries | Skill_CurvanceApp.md + Reference_CurvanceApp.md |
| Brand identity, logo, colors, mascot, Tier 1/Tier 2 | Skill_CurvanceBrand.md + Reference_CurvanceBrand.md |
| Bytes, games, referrals, achievements, partner tasks | Skill_CurvanceBytes.md + Reference_CurvanceBytes.md |
| QA checklists (Bytes, Partner Tasks) | Reference_CurvanceQA.md → QA Page Checklist |
