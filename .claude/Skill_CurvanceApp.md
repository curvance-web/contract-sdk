---
name: curvance-app
description: "Use when working on or navigating the curvance-app-v2 codebase (production frontend). Triggers: adding pages/routes, creating modules, modifying navigation, importing components, deploying to Vercel, understanding module boundaries, any file creation/editing in the repo. Compose with Skill_AerariumUI.md for UI/design rules. Do NOT use for Aerarium v2 (clean-slate frontend) or Solidity/protocol work."
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
| `modules/market` | **Transaction layer** — deposit, borrow, repay, withdraw, leverage, approval flows, modals. Also: v1 queries (pre-SDK), health factor utils, table defs (market/deposit/borrow/lend/dashboard), hooks (favorites, activities, balances) | Sidebar actions, CTA wiring, transaction UI, table column definitions |
| `modules/marketv2` | **Explore + data layer** — SDK queries (`setupChain`), tables, stats, search, market detail, stores (deposit, borrow, manage-collateral) | Page layouts, data display, SDK data access |
| `modules/dashboard` | Dashboard presentation — overview component, modular cards (bytes, rank, epoch), stores (testnet toggle, modular cards), providers (SelectedRow with navigation state machine) | Dashboard page UI chrome |
| `modules/dashboard-v2` | Dashboard data/API — queries (overview, deposit/loan lists, rewards, position health, leverage mutations), tables (deposit columns), utils (liquidation calc), Merkl API client | Dashboard data layer, liquidation logic |
| `modules/app` | **Shared foundation** — components (Button, Badge, Typography, InputField, Leverage), hooks (chains, networks, tasks, epoch), stores (approval settings, transactions, notifications), utils (explorer URLs, signatures, formatting), mutations (error reporting) | Cross-module imports, transaction persistence |
| `modules/rewards` | Active rewards — queries for `/v1/rewards/active/{network}` milestones | Rewards display (separate from Merkl) |

**Rule:** New page components go in `marketv2` (or a new module). Transaction/action components import from `market`. Both modules are actively maintained.

## SDK Integration (curvance npm package)

The entire data layer runs through the `curvance` SDK's `setupChain()` call. This is the single source of truth.

- **Root query:** `useSetupChainQuery` calls `setupChain()`, sanitizes market names (`&` → `|`), prioritizes default market (`gMON | WMON`), returns `{markets, ...chainData}`
- **All other queries** derive from this via `select` on the same query key — no separate fetches
- **SDK objects are rich:** `Market`, `CToken`, `BorrowableCToken` have methods — `getApy()`, `getPrice()`, `getUserAssetBalance(inUSD)`, `getUserCollateral(inUSD)`, `getUserDebt(inUSD)`, `deposit()`, `depositAsCollateral()`, `leverageUp()`, `leverageDown()`, `approvePlugin()`, `maxRedemption()`, etc.
- **Market aggregate getters:** `market.tvl`, `market.totalDebt`, `market.userDeposits`, `market.userDebt`, `market.userNet`, `market.userRemainingCredit`, `market.positionHealth`, `market.cooldown` — all Decimal, read from cache.
- **Dashboard data:** `market.getUserDepositsChange('day')`, `getUserDebtChange('day')`, `getUserNetChange('day')` for earnings display.
- **BorrowableCToken safety:** `depositAsCollateral()` and `postCollateral()` throw if user has outstanding debt — check before calling.
- **Decimal everywhere:** SDK returns `Decimal` (from `decimal.js`), NOT BigNumber. The v1 `market` module uses `BigNumber` — be aware of the mismatch at boundaries.

For SDK method signatures and call patterns, see Reference_CurvanceSDK.md → Market API / CToken API.

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
- **Alerts:** `checkHealthFactorAlerts` compares current vs localStorage-stored health factors, fires alerts on threshold crossings
- **Non-linear visualization:** `getStepPercent` maps values non-linearly for the health bar (0-10 → 0-20%, 10-20 → 20-52%, etc.)

## Merkl Rewards Integration

External rewards via `https://api.merkl.xyz/v4`:
- **Opportunities:** `fetchMerklOpportunities({mainProtocolId, action})` — filtered by `BORROW` or deposit
- **User rewards:** `fetchMerklUserRewards(wallet, chainId)` — aggregated by token+chain
- **Campaigns:** `fetchMerklCampaignsBySymbol(symbol)` — enriches with name, icon, price
- **APY calculation:** `nativeApy + merklApy = totalApy` per token
- **Protocol ID:** `NEXT_PUBLIC_MERKL_PROTOCOL_ID` env var
- **Feature gate:** `NEXT_PUBLIC_ENABLE_MERKL_OPPORTUNITIES === 'true'`

## Adding a Route

1. Create `pages/feature/index.tsx` (static page) — NOT `pages/feature/[param].tsx`
2. Use `router.query.param` for dynamic data (e.g., `?address=0x...`)
3. Add to ROUTE enum in `utils/enums/route.ts`
4. Add to `data/navigation/navigation.data.ts` (mobile nav) if it's a top-level page
5. Add NavigationItem in `Layout/components-tsx/navigation/navigation.tsx` (desktop nav)

Desktop nav is JSX in `navigation.tsx` using `<NavigationItem>` components. The desktop nav items (Dashboard, Explore, Bytes) are hardcoded in the render, not driven by the data file.

## Verified Imports

| Import | Path | Notes |
|---|---|---|
| `Icon` | `import Icon from '@/snippets-tsx/icon-selector/icon-selector'` | **Default** export. Keys lowercase (`weth`, `usdc`). Size via `className`. `iconType={null}` returns null. |
| `cn()` | `import { cn } from '@/utils/functions'` | Named export. clsx + twMerge. File is `.js` not `.ts`. |
| `Radix Tabs` | `import * as Tabs from '@radix-ui/react-tabs'` | ^1.1.0. Standard Radix API. |
| `Button` | `import { Button } from '@/modules/app'` | From app module barrel. |
| `usdFormatter` | `import { usdFormatter } from '@/utils/format'` | Number formatting utility. |
| `formatSidebarUSD`, etc. | `import { formatSidebarUSD, formatSidebarToken, inputFontSize, ghostFontSize } from '@/utils/v2-formatters'` | Named exports. All sidebar value displays. |
| `DragSlider`, `InfoIcon` | `import { DragSlider, InfoIcon } from '@/components/v2-primitives'` | Shared across market sidebar, vault sidebar, leverage tab. |

## Tailwind Token System

**Only use `new-*` prefixed tokens.** The config has two color systems (lines 43-95: CSS variables, lines 97-175: hardcoded hex). The CSS variable system produces invisible/wrong colors.

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

Inline styles for colors without tokens: `#282828` (bgElevated), `#7B9EC8` (steel blue / borrow), `rgba(255,255,255,0.12)` (chart grid), `rgba(255,255,255,0.25)` (ghost text), `rgba(32,32,32,0.85)` (tooltip bg).

**Non-standard breakpoints:** See Skill_AerariumUI.md — the Tailwind config has custom breakpoints (xs, newsm, xsm, base) that differ from standard Tailwind.

## Primitives Available for Reuse

Before building new UI components, check `modules/marketv2/components/market-detail/primitives/` — DeltaBadge, LiquidityBadge, RingGauge, InfoIcon, Pills, CapacityRow, MetricRow, HoverRow, ChartTooltip. Full inventory: Reference_CurvanceApp.md → Market Detail Primitives.

**Barrel import:** `from './primitives'` — but kill `yarn dev` and restart if you get "Element type is invalid" after adding new exports.

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| New page | Create `[param].tsx` dynamic route | Static page + query params (`router.query`) |
| First build | `npm install` or `bun install` | `yarn install && yarn build` |
| Adding a conditional return to a component | Place return before hooks → "Hook called conditionally" | All returns AFTER all hooks |
| Deploy to Vercel | Push from non-gas-limit account | Push from gas-limit, or trigger commit |
| New barrel export | Refresh page → "Element type is invalid" | Kill and restart `yarn dev` |
| Measure alignment in DevTools | `querySelectorAll` with Tailwind classes | Right-click → Inspect Element → Computed tab |
| Restructure JSX with sed | Line-number sed after deletions shifts everything. Tailwind `[&_svg]` bracket syntax interpreted as sed character class | Use `str_replace` or write full corrected block. Never use bracket selectors in sed. |
| Styling a Recharts chart | `outline: none` on container insufficient — browser outline leaks to inner `<rect>`, `<g>`, `<svg>` | Global CSS: `.recharts-wrapper, .recharts-wrapper * { outline: none !important; }` in `styles/defaults.css` |
| Adding dividers inside tooltips | Theme border tokens (`borderSubtle` #181818, `borderElement` #212121) invisible on glassmorphism backdrop | Use `rgba(255,255,255,0.1)` for dividers inside tooltips. Theme tokens are too dark on `rgba(32,32,32,0.85)` bg |
| Setting card/surface background colors | `rgba(255,255,255,0.03)` on `#000` background → elements invisible | Always use hex tokens for surfaces (`bg-new-elements` #181818). Low-alpha white on pure black = invisible |
| Inspect localhost with Claude | Open localhost:3000 in Chrome MCP → wallet provider (RainbowKit/wagmi) conflicts with extension content script | Use Vercel deployment URL for Claude visual inspection. Chris iterates on localhost directly |
| Using `<input type="range">` | Controlled value deadlocks after click-to-position | Use `DragSlider` from `@/components/v2-primitives` — zero `<input range>` should remain |
| Tailwind opacity modifiers (`bg-new-success/15`) | Fail silently when colors defined as raw hex in `tailwind.config.js`. Need `hsl(H S% L% / <alpha-value>)` format | Workaround: inline `style={{ background: 'rgba(...)' }}` for muted semantic backgrounds |
| Change `##` sections in Reference files (add, rename, trim, or restructure) | Modify the section, forget to update Skill References table → stale pointers or misleading descriptions | Also update the Skill file's References table — both pointers AND descriptions. Cross-check all pointers resolve before outputting |
| Sorting a dashboard column by USD value | Use `getUserShareBalance(true)` (shares × sharePrice) | Use `getUserAssetBalance(true)` (assets × assetPrice) — same unit as cell display |
| Displaying collateral balance for removal action | Use `getUserCollateral(false)` raw (returns shares) | Apply exchangeRate: `collateralShares.mul(exchangeRate)` — see `withdraw.content.tsx` or `getTokenBalanceBreakdown()` |
| Displaying collateral in token terms (any context) | Use `getUserCollateral(false)` and label as `{asset.symbol}` — shows shares, not tokens | Compute via USD: `getUserCollateral(true).div(getPrice(true))` — see `LoansTable.tsx` L170-171 |
| Adding mobile-specific data rows | Write inline expressions in JSX per breakpoint | Compute values once at component top, reference in both desktop and mobile JSX. Inline divergence causes bugs — see BUG-DISPLAY-007 |
| Computing "debt after repay" preview | Use `token.market.userDebt` (stale snapshot from page load) | Use `debtBalanceQuery.data` (real-time `fetchDebtBalanceAtTimestamp`) — matches displayed current debt |
| Debt fallback before query resolves | `debtBalanceQuery.data ?? Decimal(0)` — flashes $0 | `debtBalanceQuery.data ?? token.getUserDebt(true)` — cached snapshot as fallback |

## Open Items (Forward-Propagated)

Active across sessions — check before starting related work. Items addressed by other docs have been moved: historical data, formatting, responsive/theme → `MigrationPlan_V1Releases.md` + `Scope_DataAudit.md`.

| Item | Status | Impact |
|---|---|---|
| Wallet redirect bypass — site works without wallet on market detail, but explore/dashboard/gauge redirect | Deferred | Blocks wallet-free browsing |
| Boost icon — generic sparkle placeholder, needs Curvance/Aerarium asset | Unresolved | Visual placeholder in market table |
| Leverage tab capacity warning — no warning when leveraged borrow exceeds available liquidity | TODO | User safety |

## References

**File:** `Reference_CurvanceApp.md` (783 lines)

| Section | Lines | Description |
|---|---|---|
| Directory Structure | 28-135 | Annotated file tree with line counts and module roles (107 lines, can't split) |
| Query Inventory | 136-210 | 40+ hooks across 5 modules, cross-module dependencies |
| Market Detail Design Decisions | 683-751 | Typography scale, chart header contract, sidebar dims, stat card layout |
| Table Column Definitions | 448-503 | All 6 tables — columns, data types, responsive breakpoints |
| Dashboard Page Architecture | 536-597 | State machine, earnings calc, layout composition, SelectedRowCard desktop/mobile split |
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
| Loading States | 773-783 | Loading/empty state specs |

**Cross-references:**

| Topic | File |
|---|---|
| UI/design conventions | Skill_AerariumUI.md (compose with this file) |
| Color token hex values | Reference_AerariumUI.md → Color Tokens (L7-68) |
