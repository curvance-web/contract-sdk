---
name: curvance-app
description: "Use when working on or navigating the curvance-app-v2 codebase (production frontend). Triggers: adding pages/routes, creating modules, modifying navigation, importing components, deploying to Vercel, understanding module boundaries, any file creation/editing in the repo. Compose with Skill_AerariumUI.md for UI/design rules and Skill_CurvanceSDK.md for SDK method behavior. Do NOT use for Aerarium v2 (clean-slate frontend) or Solidity/protocol work."
---

# Curvance App (curvance-app-v2)

Rules and conventions for working in `curvance-app-v2` (branch: `dev`). Read before any file creation or modification.

## Hard Constraints

These override general Next.js/React assumptions. Discovered through build failures.

- **Static export only.** `output: 'export'` in `next.config.js`. No SSR, no `getServerSideProps`. Dynamic routes (`[param].tsx`) fail silently — deploy as 404. Use query params (`pages/feature/index.tsx` + `router.query.param`).
- **yarn only.** `yarn.lock` is canonical. npm resolves wrong rainbowkit versions → build breaks. bun corrupts package.json. Always `yarn install && yarn build`.
- **Node 18+ required.** Next.js 14.2.x won't start on older.
- **Vercel deploys from gas-limit account only.** Pushes from other accounts show ❌ on GitHub but code may be correct. Need gas-limit trigger commit.
- **Windows path restriction.** Folders containing `!` break webpack (`!` is loader syntax).

## Module Architecture

Two active module pairs — domain split, NOT migration:

| Module | Role | When to use |
|---|---|---|
| `modules/market` | **Transaction layer** — deposit, borrow, repay, withdraw, leverage, approval flows, modals. Also: v1 queries, health factor utils, table defs, hooks (favorites, activities, balances) | Sidebar actions, CTA wiring, transaction UI, table columns |
| `modules/marketv2` | **Explore + data layer** — SDK queries (`setupChain`), tables, stats, search, market detail, stores (deposit, borrow, manage-collateral) | Page layouts, data display, SDK data access |
| `modules/dashboard` | Dashboard presentation — overview, modular cards, stores, providers (SelectedRow with navigation state machine) | Dashboard page UI chrome |
| `modules/dashboard-v2` | Dashboard data/API — queries (overview, deposit/loan lists, rewards, position health, leverage mutations), tables, utils, Merkl client | Dashboard data layer, liquidation logic |
| `modules/app` | **Shared foundation** — components (Button, Badge, Typography, InputField, Leverage), hooks, stores, utils, mutations | Cross-module imports, transaction persistence |
| `modules/rewards` | Active rewards — queries for `/v1/rewards/active/{network}` milestones | Rewards display (separate from Merkl) |

**Rule:** New page components go in `marketv2` (or new module). Transaction/action components import from `market`. Both modules are actively maintained.

## SDK Integration

The entire data layer runs through the `curvance` SDK's `setupChain()`. For SDK method signatures, type system, and call patterns, see `Skill_CurvanceSDK.md`.

- **Root query:** `useSetupChainQuery` calls `setupChain()`, sanitizes market names (`&` → `|`), prioritizes default market (`gMON | WMON`), returns `{markets, ...chainData}`
- **All other queries** derive from this via `select` on the same query key — no separate fetches
- **SDK objects are rich:** `Market`, `CToken`, `BorrowableCToken` have methods — getters, mutations, previews
- **Decimal everywhere:** SDK returns `Decimal` (from `decimal.js`), NOT BigNumber. The v1 `market` module uses `BigNumber` — be aware of the mismatch at boundaries
- **BorrowableCToken safety:** `depositAsCollateral()` and `postCollateral()` throw if user has outstanding debt — check before calling

## Transaction Flow Pattern

All transactions follow the same 4-step sequence:

1. **Plugin approval** — `token.approvePlugin('simple'|leverageTypes, 'positionManager'|'zapper')`
2. **Asset approval** — ERC20 approve (unlimited vs 1/1 per `useApprovalSettingStore`)
3. **Execute** — SDK method call (deposit, borrow, repay, etc.)
4. **Cleanup** — `invalidateUserStateQueries(queryClient)`, update transaction store, complete tasks

**Transaction tracking:** `createTransactionsStore(address)` persists as `transactions_{address}` in localStorage. Each tx has `{id, status, txMethod, txHash, amount, tokenSymbol, ...}`.

**Cooldowns:** After deposit/borrow, a cooldown timer prevents immediate withdraw/repay. `market.cooldown` provides the Date. UI shows countdown with disabled buttons.

## Health Factor

- **Raw:** `market.positionHealth` (Decimal from SDK)
- **Percentage:** `(positionHealth - 1) * 100`, min 0
- **Status thresholds:** `<5` = Danger (red), `5-20` = Caution (yellow), `>20` = Healthy (green)
- **Display:** `>999%` shows as `>999%`, null shows `∞`
- **Alerts:** `checkHealthFactorAlerts` compares current vs localStorage-stored health factors, fires on threshold crossings
- **Non-linear visualization:** `getStepPercent` maps values non-linearly for the health bar

## Engagement Features (cross-reference)

Bytes currency, games (Floppy's Fortune, Bustabyte), referral system, achievements, share cards, partner tasks, and rank system are documented in `Skill_CurvanceBytes.md` + `Reference_CurvanceBytes.md`.

**Route awareness:** Bytes features live at `pages/bytes/` with 4 sub-tabs. Partner task notifications from bell icon in top nav on all pages.

## Adding a Route

1. Create `pages/feature/index.tsx` (static page) — NOT `pages/feature/[param].tsx`
2. Use `router.query.param` for dynamic data (e.g., `?address=0x...`)
3. Add to ROUTE enum in `utils/enums/route.ts`
4. Add to `data/navigation/navigation.data.ts` (mobile nav) if top-level
5. Add NavigationItem in `Layout/components-tsx/navigation/navigation.tsx` (desktop nav — hardcoded JSX, not data-driven)

## Verified Imports

| Import | Path | Notes |
|---|---|---|
| `Icon` | `import Icon from '@/snippets-tsx/icon-selector/icon-selector'` | **Default** export. Keys lowercase. Size via `className`. `iconType={null}` returns null |
| `cn()` | `import { cn } from '@/utils/functions'` | Named export. clsx + twMerge. File is `.js` not `.ts` |
| `Button` | `import { Button } from '@/modules/app'` | From app module barrel |
| `usdFormatter` | `import { usdFormatter } from '@/utils/format'` | Number formatting utility |
| `formatSidebarUSD`, etc. | `import { formatSidebarUSD, formatSidebarToken, inputFontSize, ghostFontSize } from '@/utils/v2-formatters'` | Named exports. All sidebar value displays |
| `DragSlider`, `InfoIcon` | `import { DragSlider, InfoIcon } from '@/components/v2-primitives'` | Shared across market sidebar, vault sidebar, leverage tab |
| `Radix Tabs` | `import * as Tabs from '@radix-ui/react-tabs'` | ^1.1.0 |

## Tailwind Token System

**Only use `new-*` prefixed tokens.** The config has two color systems (CSS variables + hardcoded hex). The CSS variable system produces invisible/wrong colors.

| Use | Class |
|---|---|
| Page bg | `bg-new-background` (#000) |
| Card surface | `bg-new-elements` (#181818) |
| Card hover | `bg-new-elements-hover` (#212121) |
| Card border | `border-new-border` (#181818) |
| Element border | `border-new-elements-border` (#212121) |
| Brand accent | `text-new-accent` / `bg-new-accent` (#644AEE) |
| Primary text | `text-new-foreground` (#fff) |
| Secondary text | `text-sec-text` (white/0.7) |
| Tertiary text | `text-pry-text` (white/0.5) |
| Muted text | `text-new-muted-foreground` (#6C6C6C) |
| Success | `text-new-success` (hsl 166,68%,43%) |
| Error | `text-new-error` (#FB3748) |

Inline styles for unlisted colors: `#282828` (bgElevated), `#CC6B5A` (burnt sienna / borrow), `rgba(255,255,255,0.12)` (chart grid), `rgba(32,32,32,0.85)` (tooltip bg).

**Two surface systems coexist:** Sidebar uses named hex tokens (`bg-new-elements`). Page content uses opacity tokens (`bg-white/[0.03]`, `border-white/[0.06]`). Full rules in `Skill_AerariumUI.md` → Surface Hierarchy.

**Non-standard breakpoints:** Tailwind config has custom breakpoints (xs, newsm, xsm, base) — see `Skill_AerariumUI.md`.

## Primitives Available for Reuse

Check both before building new UI:

**`components/v2-primitives/`** — shared: Pills, TogglePills, DragSlider, DonutGauge, ContextTooltip, ChartTooltip, StatCard, InfoIcon, chart-utils, v2-formatters. Barrel: `from '@/components/v2-primitives'`.

**`modules/marketv2/.../primitives/`** — market-detail specific: DeltaBadge, LiquidityBadge, RingGauge, CapacityRow, MetricRow, HoverRow. Barrel: `from './primitives'`.

Full inventory: Reference_CurvanceApp.md → Market Detail Primitives + Reference_AerariumUI.md → Established Components.

**Barrel import gotcha:** Kill `yarn dev` and restart if you get "Element type is invalid" after adding new exports.

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| New page | Create `[param].tsx` dynamic route | Static page + query params (`router.query`) |
| First build | `npm install` or `bun install` | `yarn install && yarn build` |
| Adding a conditional return to a component | Place return before hooks → "Hook called conditionally" | All returns AFTER all hooks |
| Deploy to Vercel | Push from non-gas-limit account | Push from gas-limit, or trigger commit |
| New barrel export | Refresh → "Element type is invalid" | Kill and restart `yarn dev` |
| Measure alignment in DevTools | `querySelectorAll` with Tailwind classes | Right-click → Inspect Element → Computed tab |
| Restructure JSX with sed | Line-number sed shifts. Bracket syntax interpreted as sed character class | Use `str_replace` or write full corrected block. Never bracket selectors in sed |
| Inspect localhost with Claude | Open localhost:3000 in Chrome MCP → wallet provider conflicts | Use Vercel deployment URL for Claude inspection. Chris iterates on localhost directly |
| Using `<input type="range">` | Controlled value deadlocks after click | Use `DragSlider` from `@/components/v2-primitives` |
| Change `##` sections in Reference files | Modify section, forget Skill table | Also update Skill References table — pointers AND descriptions |
| Sorting a dashboard column by USD | `getUserShareBalance(true)` (shares × sharePrice) | `getUserAssetBalance(true)` (assets × assetPrice) — matches cell display |
| Displaying collateral for removal | `getUserCollateral(false)` raw (returns shares) | Apply exchangeRate: `collateralShares.mul(exchangeRate)` — see `withdraw.content.tsx` |
| Displaying collateral in token terms | `getUserCollateral(false)` labeled as `{asset.symbol}` | Compute via USD: `getUserCollateral(true).div(getPrice(true))` — see `LoansTable.tsx` L170-171 |
| Adding mobile-specific data rows | Inline expressions per breakpoint | Compute values once at component top, reference in both paths |
| Computing "debt after repay" preview | `token.market.userDebt` (stale page-load snapshot) | `debtBalanceQuery.data` (real-time `fetchDebtBalanceAtTimestamp`) |
| Debt fallback before query resolves | `debtBalanceQuery.data ?? Decimal(0)` — flashes $0 | `debtBalanceQuery.data ?? token.getUserDebt(true)` — cached snapshot as fallback |

## References

**File:** `Reference_CurvanceApp.md` (824 lines)

| Section | Lines | Description |
|---|---|---|
| Directory Structure | 28-135 | Annotated file tree with line counts and module roles (107 lines, can't split) |
| Query Inventory | 136-210 | 40+ hooks across 5 modules, cross-module dependencies |
| Market Detail Design Decisions | 683-751 | Typography scale, chart header contract, sidebar dims, stat card layout |
| Table Column Definitions | 448-503 | All 6 tables — columns, data types, responsive breakpoints |
| Dashboard Page Architecture | 536-597 | State machine, earnings calc, layout composition, SelectedRowCard split |
| State Management | 398-447 | All stores (persisted, ephemeral, context, localStorage keys) |
| Component APIs | 227-273 | Icon, StatCard, Table — behavioral gotchas |
| Market Detail Primitives | 359-397 | DeltaBadge, LiquidityBadge, RingGauge, InfoIcon, etc. |
| Utility Functions | 617-651 | Health factor, formatting, market utils, app utils |
| Transaction Flows | 504-535 | Record shape + post-tx cleanup |
| Dead Code | 652-682 | Confirmed dead, likely dead, NOT dead despite age |
| Market Detail Status | 329-358 | File tree + phase status |
| Chain Configuration | 300-328 | Chain enum, network config, feature flags |
| Technology Stack | 7-27 | Full stack + version table |
| Sidebar Reuse Decisions | 752-772 | What's reused vs rebuilt |
| Liquidation Calculations | 598-616 | Price calculation logic |
| SDK Object Model | 211-226 | Decimal boundary, name sanitization |
| Explore Page Behavior | 284-299 | Live behavior description |
| Explore Page Imports | 274-277 | Source pointer + cross-module summary |
| Dashboard Page Imports | 278-283 | Source pointer + cross-module summary |
| Loading States | 773-786 | Loading/empty state specs |
| Bytes & Engagement Features | 787-794 | Engagement feature migration notes |
| Merkl Rewards Integration | 795-813 | SDK functions, app-side integration, APY calc, protocol ID, feature gate |
| User Onboarding Guide | 814-824 | 15-step deposit tour, 10-step borrow tour, tooltip card spec |

**Cross-references:**

| Topic | File |
|---|---|
| UI/design conventions | Skill_AerariumUI.md (compose with this file) |
| Color token hex values | Reference_AerariumUI.md → Color Tokens |
| Brand identity, logo, mascot | Skill_CurvanceBrand.md + Reference_CurvanceBrand.md |
| Bytes, games, referrals, achievements, partner tasks | Skill_CurvanceBytes.md + Reference_CurvanceBytes.md |
| SDK method signatures, type system | Skill_CurvanceSDK.md + Reference_CurvanceSDK.md |
| Display bug patterns, QA checklists | Skill_CurvanceQA.md + Reference_CurvanceQA.md |
