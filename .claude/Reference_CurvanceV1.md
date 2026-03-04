# Curvance V1 Codebase — Reference

Deep lookup reference for `curvance-app-v2`. Consult specific `##` sections as needed via the reference table in `Skill_CurvanceV1.md`.

---

## Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (Pages Router) | ^14.2.7 | NOT App Router. `pages/` for routes. `output: 'export'` (static). |
| Language | TypeScript | 95.6% of codebase | Strict typing throughout. |
| Styling | Tailwind CSS + SCSS | 3.4.0 / 1.3% | Tailwind primary, SCSS for edge cases. `darkMode: 'class'`. 418-line custom config. |
| UI Primitives | Radix UI | Full suite (~20 pkgs) | Accordion, Dialog, Dropdown, Popover, Select, Slider, Tabs, Toggle, Tooltip |
| Charts | @nivo/pie + recharts | ^0.87.0 / ^2.x | nivo for milestone circle. recharts for market detail charts (area/line/composed). |
| Data Fetching | @tanstack/react-query | ^5.45.1 | Module queries pattern. |
| Tables | @tanstack/react-table | via match-sorter | Market + dashboard tables. |
| State | zustand | ^4.4.0 | Per-module stores in `modules/*/stores/`. |
| Forms | react-hook-form | ^7.51.4 | With @hookform/resolvers. |
| Animation | framer-motion | ^10.15.1 | Transitions. |
| Wallet | wagmi + viem + RainbowKit | 2.12.8 / 2.x / ^2.1.2 | Lite → Default mode switch. |
| Theming | next-themes | ^0.4.6 | Light/dark via class toggle. Live site = light. |
| Package Manager | yarn | yarn.lock canonical | bun/npm break builds. `bunfig.toml` exists but DO NOT USE bun. |
| Testing | Vitest | test / test:ui / test:run | Unit tests in `src/test/`. |

---

## Directory Structure

```
curvance-app-v2/
├── pages/                          # Next.js route shells (thin wrappers)
│   ├── index.tsx                   # EXPLORE PAGE (718 lines, imports from marketv2)
│   ├── market/
│   │   ├── index.tsx               # v1 market page (128 lines, imports from modules/market)
│   │   └── [address].tsx           # Market detail (thin shell → MarketDetailPage)
│   ├── earn/                       # (TODO — vault detail page)
│   ├── dashboard.tsx               # Dashboard page
│   ├── bytes/                      # Bytes game pages
│   ├── leaderboard/                # Leaderboard
│   ├── lock/                       # Lock page + claim + migrate
│   ├── monad/                      # Monad-specific page
│   ├── _app.tsx                    # App wrapper
│   ├── _document.js                # Document head
│   ├── 404.tsx, _error.tsx         # Error pages
│   ├── airdrop.tsx, bridge.tsx, gauge.tsx
│   └── privacy-policy.tsx, terms-of-use.tsx
│
├── Layout/                         # App shell components
│   ├── components-tsx/
│   │   ├── navigation/
│   │   │   ├── navigation.tsx      # Desktop nav (125 lines) — uses NavLogic, NavigationItem
│   │   │   ├── index/
│   │   │   │   ├── mobile-menu.tsx
│   │   │   │   ├── navigation-item.sub.tsx
│   │   │   │   └── rewards-drawer.tsx
│   │   │   └── logic/              # NavLogic hook
│   │   ├── Statusbar/
│   │   ├── dashboard/
│   │   ├── monad/
│   │   ├── sidebar/
│   │   └── toggle-theme/
│   ├── components/
│   └── logic/
│
├── modules/                        # Domain feature modules
│   ├── market/                     # TRANSACTION LAYER
│   │   ├── components/
│   │   │   ├── borrow/             # Borrow flow
│   │   │   ├── deposit/            # Deposit flow
│   │   │   ├── withdraw/           # Withdraw flow
│   │   │   ├── repay/              # Repay flow
│   │   │   ├── manage-collateral/  # Collateral management
│   │   │   ├── dialogs/            # Transaction dialogs
│   │   │   ├── health-factor/      # Health visualization
│   │   │   ├── tables/             # Transaction history
│   │   │   ├── leverage-slider.tsx  # 218 lines, touch handling
│   │   │   ├── token-select.tsx     # Ariakit combobox
│   │   │   ├── transaction-steps.tsx # Transaction flow UI
│   │   │   ├── approval-button.tsx  # Approval + execute button
│   │   │   ├── amount-card.tsx      # Amount input component
│   │   │   ├── balance-card.tsx
│   │   │   ├── percentage-slider.tsx
│   │   │   └── advanced-details.tsx
│   │   ├── constants/, enums/, hooks/, layout/, stores/, types/
│   │
│   ├── marketv2/                   # EXPLORE + DATA LAYER
│   │   ├── components/
│   │   │   ├── tables/             # cells/, deposit-table, borrow-table
│   │   │   ├── market-detail/      # ~30 files — see Market Detail Status
│   │   │   ├── SearchInput.tsx
│   │   │   ├── milestone.tsx
│   │   │   └── position-health.tsx
│   │   ├── queries/index.ts        # 352 lines, ALL queries
│   │   ├── stores/                 # borrow-token, manage-collateral, market, table
│   │   ├── mutations/, utils/
│   │
│   ├── dashboard/                  # Dashboard presentation
│   ├── dashboard-v2/               # Dashboard data/API
│   ├── app/                        # Shared app module (Button, hooks)
│   ├── earn/                       # (TODO — vault module)
│   ├── achievements/, airdrop/, bridge/, bytes/
│   ├── faucet/, faucetv2/queries/
│   ├── feedback/, gauge/, guided-tour/
│   ├── leaderboard/, lock/, monad/
│   ├── referral/, rewards/queries/
│
├── data/
│   ├── navigation/navigation.data.ts  # Mobile nav data (NavigationKeys, MOBILE_NAVIGATION_DATA)
│   ├── Layout/, claim/, dashboard/, home/, layout/, locks/, meta/, onboarding/
│
├── components/                     # Shared UI components
│   ├── Dashboard/Shared/           # StatCard, InfoDialog
│   ├── Shared/                     # SearchEmptyState
│   └── skeleton/                   # TableSkeletonBuilder
│
├── snippets-tsx/                   # Reusable snippets
│   ├── icon-selector/icon-selector.tsx  # Icon component (default export)
│   ├── popover/, scroll-area/, table/
│
├── utils/
│   ├── enums/route.ts              # ROUTE enum
│   ├── functions/                  # cn(), general utils
│   ├── format/                     # usdFormatter, tokenFormatter
│   ├── store/nav.ts                # useSidebarStore, useRewardsDrawerStore
│   └── axios/
│
├── blockchain/functions/           # SDK + chain interaction
├── styles/                         # Global CSS, defaults.css
├── src/test/                       # Vitest tests
└── tailwind.config.js              # 418 lines, heavily customized
```

---

## Query Inventory

### marketv2/queries/index.ts (SDK-based, primary data layer)

| Hook | Purpose | Key Dependencies |
|---|---|---|
| `useSetupChainQuery` | Root query — `setupChain()`, sanitizes names, returns `{markets, ...chainData}` | signer, chainId |
| `useMarketsQuery` | Select markets from setup | useSetupChainQuery |
| `useAllTokensQuery` | Flatten all tokens, deduplicate by address | useSetupChainQuery |
| `useBorrowableTokensQuery` | `{eligible, ineligible}` filtered by `hasPositiveDebtCap()` | useSetupChainQuery |
| `useMarketStatsQuery` | `{totalDeposits, activeLoans}` aggregated | useSetupChainQuery |
| `useGlobalTvlQuery` | Sum `market.tvl` across all markets | useSetupChainQuery |
| `useZapTokensQuery` | `token.getDepositTokens(search)` → zap tokens with zapperType | token, search |
| `useBalancePriceTokenQuery` | Balance + price for deposit token | token |
| `useZapTokenQuoteQuery` | `zapToken.quote()` with slippage → `{output, minOut}` | zapToken, amount |
| `useMaxRedemptionQuery` | `token.maxRedemption()`, rounds down | token, signer |
| `useMaxLeverageQuery` | `market.reader.hypotheticalLeverageOf()` | market, token, amount |
| `useMerklBorrowOpportunitiesQuery` | Merkl opportunities filtered by `action='BORROW'` | MERKL_PROTOCOL_ID |

### dashboard-v2/queries/index.ts (dashboard data layer)

| Hook | Purpose | Key Dependencies |
|---|---|---|
| `useDashboardOverview` | `{deposits, debts, portfolio}` + day changes from market methods | markets |
| `useDepositDashboardQuery` | Tokens where `getUserAssetBalance(true) > 0` | markets |
| `useLoanDashboardQuery` | Borrowable tokens where `getUserDebt(false) > 0` | markets |
| `useGetPositionHealthQuery` | `market.reloadUserData()` → positionHealth as percentage + status | token |
| `useDepositV2Mutation` | Full deposit flow: plugin→approval→zap→deposit→invalidate | token, amount |
| `useGetApyQuery` | `selectedRowData.rowData.getApy()` | selectedRow |
| `useBalanceQuery` | `asset.balanceOf()` → Decimal | asset, address |
| `useLeverageDownMutation` | `token.approvePlugin` + `token.leverageDown()` | token |
| `useLeverageUpMutation` | `token.approvePlugin` + `token.leverageUp()` | token |
| `useRewardsDashboardQuery` | Merkl user rewards aggregated by token+chain, enriched with campaigns | wallet, chainId |

### market/queries/index.ts (v1 pre-SDK queries, still active)

| Hook | Purpose | Key Dependencies |
|---|---|---|
| `useMarketAndAssetQuery` | `getAllMarkets()` → `{marketData, allMarketsAndAssets}` | enabled: false (manual) |
| `useMarketsQuery` (v1) | Select marketData only | useMarketAndAssetQuery |
| `useAllMarketAssetsQuery` | Flatten pTokens + eTokens with isPToken flag | useMarketAndAssetQuery |
| `usePTokenMarketAssetsQuery` | Only pTokens (deposit assets) | useMarketAndAssetQuery |
| `useNonPTokenMarketAssetsQuery` | Only eTokens (borrow/lend assets) | useMarketAndAssetQuery |
| `useUserAssetsQuery(category)` | Filter by 'All'\|'Deposit'\|'Borrow'\|'Lend' based on balances | useMarketAndAssetQuery |
| `useHoldExpiresQuery` | `market.functions.holdExpiresAt()`, auto-refetch on expire | market |
| `useMarketHoldExpiresQuery` | Batch `multiHoldExpiresAt` for all markets | markets |
| `useHypotheticalLiquidityQuery` | `asset.functions.hypotheticalLiquidityOf()` | asset |
| `useAssetDebtWatcherQuery` | Polls `debtAt(THIRD_SECONDS)` every 30s | asset |
| `useHealthFactorQuery` | `market.functions.getHealthFactor()` → percentage + status | market, address |
| `useMaxLeverageQuery` (v1) | `Zapping.getMaxLeverageMultiplier()` | market, token |
| `useIsPluginEnabledQuery` | Check simpleZapper plugin approval | market, address |
| `useIsZapperLeverageEnabledQuery` | Check positionManagementBase plugin | market, address |
| `useAllowanceCheck` | ERC20 allowance check | token, spender |
| `useSupportsZappingQuery` | `zapManager.hasSolverSupport()` | market |

### app/queries (app-level)

| Hook | Purpose | Key Dependencies |
|---|---|---|
| `useUserTransactionHistoryQuery` | Combine store transactions, deduplicate by txHash, 60s refetch | address, chainId |
| `useNextHealthFactor` | `getHealthFactor` with debt/collateral changes | market, changes |
| `usePreviewPositionHealth*` | 7 variants: Deposit, Redeem, Borrow, Repay, LeverageUp/Down, LeverageDeposit | market, token, amount |
| `usePreviewImpactQuery` | `market.previewAssetImpact` for deposit/borrow on 'day' timeframe | market, token |
| `useGetUserAssetBalanceQuery` | `token.getUserUnderlyingBalance(inUSD)` or wagmi `useBalance` for native | token, address |
| `useEditLeverageHelpQuery` | `token.previewLeverageUp/Down` based on newLeverage vs current | token, leverage |
| `useShareReportErrorMutation` | POST to Discord webhook (message or file) | error data |

### rewards/queries

| Hook | Purpose |
|---|---|
| `useGetActiveRewardsQuery` | GET `/v1/rewards/active/{networkSlug}` → `{milestones: {market, tvl, multiplier}[]}` |

---

## SDK Object Model

> For complete class APIs (all methods, params, return types), see **Reference_CurvanceSDK.md → Class APIs**. Below covers only V1-app-specific usage notes.

### V1 Consumption Notes

- **`Decimal` boundary:** SDK returns `decimal.js` Decimal everywhere. The V1 `market` module uses `BigNumber` internally. Convert at boundaries with `FormatConverter`.
- **`setupChain()` sanitizes market names:** `&` → `|`. Don't assume raw SDK names match displayed names.
- **`positionHealth` is raw Decimal:** Multiply by 100 for percentage display. `null` means infinite (no debt).
- **`cooldown` is a Date:** Compare against `Date.now()` to determine if withdraw/repay is blocked.
- **Preview methods are synchronous:** All `previewPositionHealth*` methods read cached state — call `market.reloadUserData()` first if state may be stale.
- **`token.getPrice()` default is share price:** Pass `true` for asset/USD price. Common mistake in dashboard calculations.
- **`isBorrowable` determines type:** If `true`, token is already typed as `BorrowableCToken` with `getUserDebt`, `getBorrowRate`, `getLiquidity`, `liquidationPrice`. No casting needed.

---

## Component APIs

### Icon (`snippets-tsx/icon-selector/icon-selector.tsx`)
```tsx
import Icon from '@/snippets-tsx/icon-selector/icon-selector';
<Icon iconType="weth" className="w-7 h-7" />
```
- **Default export** — `import { Icon }` fails
- Path includes filename: `icon-selector/icon-selector` (no index re-export)
- Keys lowercase: `weth`, `usdc`, `monad`, `arb`, `eth`, `dai`, `wbtc`
- Sizing via `className`, not width/height props
- `iconType={null}` returns `null` (safe for conditional rendering)
- Registry categories: LOGOS, MONAD, FLAGS, RANKS, SOCIALS, ACTIONS, NAVIGATION, SVGS, MISCALLENOUS, MARKETS, NFTS, FAUCETS

### StatCard (`components/Dashboard/Shared/StatCard.tsx`)
```tsx
// 28 lines. Compound component:
Stats.Root  → div.flex.flex-1.flex-col.bg-background-surface.p-4.rounded-2xl
Stats.Label → span.text-text-secondary
Stats.Value → span.font-medium.text-lg.md:text-3xl.xl:text-[32px]
```
Note: Market detail page does NOT use this — built custom `MarketStatCard` with micro-viz slots.

### Table Infrastructure

All tables use `@tanstack/react-table` with `fuzzyFilter` from `snippets-tsx/table/logic/fuzzy-filter`.

**Common patterns across all tables:**
- Column visibility persisted in localStorage (`*-columns-visibility`)
- Column order persisted in localStorage (`*-column-order`)
- Row pinning via `useRowsPinning()` hook (localStorage)
- Row IDs include `chainId` for uniqueness
- Left pin: first column (asset/market name). Right pin: actions column
- `keepPinnedRows: false` — pinned rows don't duplicate in main list
- Touch device detection via `useIsTouchDevice()` for responsive column sizes

**Rendering locations:**
- Explore page tables: `marketv2/components/tables/` (deposit-table, borrow-table, cells/)
- Explore column definitions: `market/components/tables/` (market, deposit, borrow, lend)
- Dashboard deposits table: `dashboard-v2/tables/deposit.tsx`
- Dashboard loans table: `components/Dashboard/LoansTable`
- Dashboard history/rewards: inline in `pages/dashboard.tsx`

→ Full column specs in **Table Column Definitions** section above.

---

## Explore Page Imports

Source: `pages/index.tsx` (718 lines) — `view` first 30 lines for full import list. Key cross-module dependencies: data from `marketv2` queries/stores, transaction overlays from `market`, shared UI from `components/Dashboard/Shared` and `snippets-tsx`.

## Dashboard Page Imports

Source: `pages/dashboard.tsx` (2500+ lines, mega-file) — `view` first 40 lines for full import list. Key cross-module dependencies: data from `dashboard-v2` queries/stores/utils, navigation state machine from `dashboard/providers` (SelectedRowProvider), transaction overlays from `market`, shared stores from `marketv2`, SDK types from `curvance`.

---

## Explore Page Behavior

Current live behavior at app.curvance.com:

- Two stat cards: Total Deposits ($56.6M), Active Loans ($21.9M)
- Milestone progress bar (76%, $56.6M/$75M) with "15% BONUS BYTES" badge
- Deposit/Borrow tab toggle
- Table columns: Collateral (icon+name+boost badges), Loan, Deposits↓, Liquidity⊙, Deposit APY (with emoji indicators), Milestone (circular progress)
- **Click row → expands inline** with per-token breakdown (LTV, Deposits, Liquidity, Deposit APY, Your Deposits per token)
- **NO navigation to market detail** — row expand updates right sidebar
- Right sidebar: Deposit/Borrow panel with token selectors, amount input, 25/50/75/Max buttons, APY summary

Phase 5b will add: row click → navigate to `/market?address=...` (in addition to or replacing inline expand — TBD).

---

## Chain Configuration

From `app/hooks/index.ts`:

```ts
// Available chains (useChainsConfig)
[monadTestnetConfig, monadConfig, hyperliquidConfig, ethereumConfig, arbSepoliaConfig]

// Chain enum (app/enums)
Chain.BeraChain = 80084
Chain.ArbSepolia = 421614
Chain.Sepolia = 11155111
Chain.Movement = 30732
Chain.Monad = 10143

// Conditional network availability
availableNetwork = isMonad
  ? { 'Monad Testnet': 10143 }
  : { 'Monad Testnet': 10143, Ethereum: 1, ... }
```

**Movement special case:** Explorer URLs use `/#/txn/{hash}?network=testnet` instead of standard `/tx/{hash}`.

**Merkl protocol ID:** `NEXT_PUBLIC_MERKL_PROTOCOL_ID` env var, used for all Merkl API calls.

**Feature flags:** `FeatureGate` component + `featureFlags` map + `isFeatureEnabled()` for conditional features. Bytes rewards gated by `NEXT_PUBLIC_BYTES_REWARDS === 'true'`.

---

## Market Detail Status

**~30 files, ~3,500 lines** in `modules/marketv2/components/market-detail/`.

### File Tree
```
market-detail/
├── index.ts, types.ts, constants.ts
├── market-detail-page.tsx (117 lines — orchestrator)
├── market-header.tsx (73 lines)
├── market-stat-cards.tsx
├── market-tabs.tsx (131 lines — 5-tab Radix Tabs)
├── primitives/ (9 exports via barrel)
│   ├── ring-gauge, delta-badge, liquidity-badge, info-icon
│   ├── pills, capacity-row (191 lines), metric-row, hover-row, chart-tooltip
├── overview/ (unified-chart, apy-chart, token-market-section)
├── interest-rate/ (irm-chart — 383 lines)
├── leverage/ (leverage-tab — earnings simulator)
└── sidebar/ (action-sidebar — 3-tab, visual complete)
```

### Phase Status
| Phase | Status | Notes |
|---|---|---|
| 1-5a: Visual complete | ✅ | Route, layout, stat cards, charts, sidebar, leverage, polish |
| 5b: Navigation + responsive | ☐ | Explore row click → `/market/[address]`, loading/error states |
| 6: Query integration | ☐ | Wire real data, approval flow, store connections |

---

## Market Detail Primitives

All in `modules/marketv2/components/market-detail/primitives/`.

### DeltaBadge
```tsx
import { DeltaBadge } from './primitives';
<DeltaBadge value={2.8} size="md" />  // ▲ 2.8% (green) or ▼ -1.2% (red)
```
- `size`: `sm` (10px, px-[5px] py-[2px]) | `md` (12px, px-1.5 py-[3px], default)
- Auto-colors: positive → `text-new-success`, negative → `text-new-error`
- Classes: `inline-flex items-center gap-0.5 font-semibold leading-none rounded tabular-nums`

### LiquidityBadge
```tsx
import { LiquidityBadge } from './primitives';
<LiquidityBadge availablePercent={71} size="md" />
```
- Same box model as DeltaBadge for pixel alignment
- Health-coded: ≥30% green, 10-29% yellow, <10% red
- Contains 28×5px inline fill bar (HTML div, not SVG)

### Pills
```tsx
import { Pills } from './primitives';
<Pills options={['Deposits','Borrow','Liquidity']} value={selected} onChange={setSelected} size="md" />
```
- `size`: `sm` (text-[11px]) | `md` (text-xs, default)

### CapacityRow
```tsx
import { CapacityRow } from './primitives';
<CapacityRow label="Total Collateral" current={78.8} cap={95} unit="M" tooltip="..." />
```
- 191 lines. Ring gauge + amount/cap display + hover tooltip
- Shows `$78.8M / $95M` with ring fill proportional to usage

---

## State Management

### Zustand Stores (persisted)

| Store | Location | Persisted Key | State |
|---|---|---|---|
| `useApprovalSettingStore` | `app/store` | `approval-setting` | `{approvalSetting: 'unlimited'\|'1/1'}` |
| `createTransactionsStore(addr)` | `app/store` | `transactions_{addr}` | `{walletAddress, transactions[], addTransaction, updateTransaction}` |
| `createClaimStore(addr)` | `app/store` | `claim_{addr}` | Same shape as transactions |
| `useNotificationStore` | `app/store` | `notification-store` | `{data: Record<Address, {count}>}` |
| `useTestnetToggleStore` | `dashboard/stores` | `testnet-toggle` | `{testnetEnabled, toggle}` |
| `useModularDashboardStore` | `dashboard/stores` | `modular-dashboard` | `{cards: ModularCardItem[], maxCards: 4}` |

### Zustand Stores (ephemeral)

| Store | Location | State |
|---|---|---|
| `useDepositStore` | `marketv2/stores/market` | `{depositToken, market, zapToken, amount, leverage, currencyView, depositStatus, isLeverageEdit}` |
| `useBorrowStore` | `marketv2/stores/borrow-token` | `{token, market, amount}` |
| `useSelectedManageCollateral` | `marketv2/stores/manage-collateral` | `{token, market, amount}` |
| `useTableStore` | `marketv2/stores/table` | `{search, onSearchChange}` |
| `useDashboardTableStore` | `dashboard-v2/stores/table` | `{search, onSearchChange}` |
| `useTokenStore` | `market/stores` | `{selectedToken, balance, setSelectedToken}` |
| `useSidebarStore` | `utils/store/nav` | Sidebar open/close state |
| `useRewardsDrawerStore` | `utils/store/nav` | Rewards drawer open/close |

### Context Providers

| Provider | Location | Provides |
|---|---|---|
| `AssetContextProvider` | `market/stores` | Scoped IPToken\|IEToken + market to a table row |
| `SelectedRowProvider` | `dashboard/providers` | `{selectedRow, currentView, navigateTo, goBack}` — navigation state machine with views: `'dashboard'\|'deposit'\|'withdraw'\|'borrow'\|'repay'\|'manage-collateral'\|null` |
| `TransactionsContext` | `app/providers` | Transaction store scoped to current wallet address |

### localStorage Direct Usage

| Key Pattern | Used By | Data |
|---|---|---|
| `markets-columns-visibility` | useMarketTable | Column visibility state |
| `deposit-columns-visibility` | useDepositTable | Column visibility state |
| `borrow-columns-visibility` | useBorrowTable | Column visibility state |
| `lend-columns-visibility` | useLendTable | Column visibility state |
| `*-column-order` | All tables | Column reorder state |
| `row-pinning` | useRowsPinning | Pinned row IDs |
| `favorites-{chainId}` | useFavoritesMarkets | Favorited market addresses |
| `isCollateralized` | Dashboard EmptyPanel | Deposit mode toggle |
| `healthFactor-*` | checkHealthFactorAlerts | Previous health factor for alert detection |

---

## Table Column Definitions

### Explore Page Tables

**Market Table** (`market/components/tables/market.tsx`):
Columns: Market Name | TVL | Total Deposits | Total Lent
- Data type: `IMarket[]`
- Values: `market.usdTVL`, `market.usdCollateralPostedTVL`, `market.usdTotalLent`

**Deposit Table** (`market/components/tables/deposit.tsx`):
Columns: Asset | Market Name* | Price | TVL | LTV | Collateral Capacity | Your Deposits | Actions
- Data type: `DepositAsset` = `IPToken & {isPToken, market}`
- *Market Name hidden when `hideMarketNameColumn=true`
- Collateral Capacity shows fill status (90% = almost full, 100% = full)
- Your Deposits tooltip shows collateral breakdown
- Responsive: Collateral Capacity hidden max-lg, TVL hidden max-sm

**Borrow Table** (`market/components/tables/borrow.tsx`):
Columns: Asset | Market Name* | Price | Available Liquidity | Utilization Rate | Interest Rate | Your Debt | Actions
- Data type: `BorrowAsset` = `IEToken & {isPToken, market}`
- Interest Rate shows `borrowRatePerYear` via `getValueSymbol`
- Responsive: Available Liquidity hidden max-lg, Interest Rate hidden max-md

**Lend Table** (`market/components/tables/lend.tsx`):
Columns: Asset | Market Name* | Price | Utilization Rate | Supply vAPY | Available Liquidity | Your Deposits | Actions
- Data type: `LendAsset` = `IEToken & {isPToken, market}`

### Dashboard Tables

**Dashboard Deposits Table** (`dashboard-v2/tables/deposit.tsx`):
Columns: Asset | Deposits | Collateral | Leverage | Position Health | Actions (chevron)
- Data type: `CToken[]` (SDK objects directly)
- Expandable rows with: Price, Liquidation Price, Collateral Cap, LTV, Deposit vAPY, Position Health bar
- Asset column shows both tokens in market pair
- Deposits: `getUserAssetBalance(true)` in USD, `convertUsdToTokens` for token amount — BUT sort accessor uses `getUserShareBalance(true)` (shares × sharePrice diverges from assets × assetPrice as exchange rate grows)
- Collateral: `getUserCollateral(true/false)` with edit pencil icon — NOTE: `getUserCollateral(false)` returns SHARES (cToken units via `collateralPosted`), not asset tokens. Conversion needed: `collateralShares × exchangeRate`
- Leverage: `getLeverage()?.toFixed(2)x` or `-`
- Position Health: `market.positionHealth * 100` with color-coded badge

**Dashboard Loans Table** (`components/Dashboard/LoansTable`):
- Referenced from `pages/dashboard.tsx`, uses `useLoanDashboardQuery`
- Columns defined in separate LoansTable component
- DebtCell falls back to `Decimal(0)` before query resolves (should use `getUserDebt(true)` cache). Repay preview uses stale `market.userDebt` for "after" calculation instead of `debtBalanceQuery.data`

**Dashboard History Table** (inline in `pages/dashboard.tsx`):
Columns: Type | Amount | Date | Actions (View tx link)
- Data source: `useTransactionsStore` filtered by `status === 'success'`
- Type display map: deposits→Deposit, withdrawals→Withdrawal, borrows→Borrow, etc.
- Export support: CSV/JSON with date range picker

**Dashboard Rewards Table** (`dashboard/components/rewards/table.tsx`):
- Data source: `useRewardsDashboardQuery` (Merkl aggregated rewards)
- Type: `RewardsTableRow[]` with token, chain, amount, usdValue

---

## Transaction Flows

> For step-by-step mutation flows (deposit, borrow, repay, withdraw, collateral, leverage), see **Reference_CurvanceSDK.md → V1 Action Patterns**. Below covers V1-app-specific transaction infrastructure.

### Common Post-Transaction Sequence
All mutations follow the same cleanup: `invalidateUserStateQueries(queryClient)` → complete tasks → update transaction store. Cooldown begins after deposit/borrow — `market.cooldown` provides the end Date.

### Transaction Record Shape
```ts
type TransactionType = {
  id: string;
  status: 'pending' | 'success' | 'failed';
  txMethod: string;        // 'deposits' | 'borrows' | 'repay' | 'withdrawals' | ...
  assetAddress: string;
  network: string;
  marketAddress: string;
  user: string;
  timestamp: string;
  tokenName: string;
  tokenSymbol: string;
  amount: string;
  txHash: string;
  lockType?: string;
  reward?: string;
  asset?: any;
};
```

Persisted via `createTransactionsStore(address)` → localStorage key `transactions_{address}`. Dashboard history tab filters by `status === 'success'`.

---

## Dashboard Page Architecture

`pages/dashboard.tsx` is a large single-file page (~2500+ lines) with these key sections:

### Layout
```
┌────────────────────────────────────────────────────────┐
│ DashboardStats (4 stat cards)                          │
│ [Total Rewards] [Portfolio Value] [Deposits] [Debt]    │
├────────────────────────────────┬───────────────────────┤
│ DashboardTabs                  │ DashboardViewManager  │
│ [Deposits|Loans|History|Rewards]│ (sticky sidebar)      │
│                                │                       │
│ Active tab content:            │ Context-dependent:     │
│ - DepositsTable (expandable)   │ - SelectedRowCard      │
│ - LoansTable                   │ - DepositOverview      │
│ - HistoryTable                 │ - WithdrawOverview     │
│ - RewardsTable                 │ - BorrowOverview       │
│                                │ - RepayOverview        │
│                                │ - ManageCollateral     │
└────────────────────────────────┴───────────────────────┘
```

### Navigation State Machine (SelectedRowProvider)
```
null (default card) ─→ 'deposit' ─→ DepositOverview
                    ─→ 'withdraw' ─→ WithdrawOverview
                    ─→ 'borrow' ─→ BorrowOverview
                    ─→ 'repay' ─→ RepayOverview
                    ─→ 'manage-collateral' ─→ ManageCollateralOverview
```

### Position Earnings Calculation (`usePositionEarnings`)
```ts
// Deposit earnings per day
earningPerDay = positionValueUsd * (nativeApy + merklApy) / 365

// Borrow cost per day (net of Merkl subsidies)
effectiveBorrowApy = borrowApy - merklBorrowApy
changePerDay = debtValueUsd * effectiveBorrowApy / 365

// Net
netEarningPerDay = totalDepositEarningPerDay - totalBorrowChangePerDay
```

Native APY sources: `token.nativeYield` (if non-zero), else `token.getApy()` + `apyMarketMap[symbol]?.value`

### Mobile: Drawer-based Management
On mobile/tablet (`<1468px`), the sidebar becomes a `vaul` Drawer with the same navigation state machine but triggered via "Manage" button on each row card.

---

## Liquidation Calculations

From `dashboard-v2/utils/liquidation.ts`:

### `getLoanLiquidationPrice(token: BorrowableCToken)`
1. Find collateral token: prefers non-borrowable token with `getUserCollateral(false) > 0`, falls back to highest collateral token
2. Try SDK: `token.liquidationPrice` (Decimal)
3. If SDK fails, manual calculation:
   - Method A: `marketDebt / marketMaxDebt` ratio applied
   - Method B: `tokenDebt / (collateralUsd * collReqSoft)`
4. Returns `{priceUsd: Decimal, collateralToken: CToken}`

### Display Formatting
- `formatLiquidationPrice(price)`: Compact notation with M/B/T/Q suffixes for values > 1M
- `formatLiquidationRatio(price, spotPrice)`: Shows as "X% of spot", handles >9999% case
- Null/zero → "—"

---

## Utility Functions

### market/utils/health-factor.ts
- `getStatus(value)`: `<5` → 'Danger', `5-20` → 'Caution', `>20` → 'Healthy'
- `healthFactorToPercentage(raw)`: `(raw - 1) * 100`, min 0
- `formatHealthFactor(raw)`: null → '∞', ≥999 → '>999%', else formatted %
- `getStepPercent(value)`: Non-linear mapping for health bar visualization
- `getTextColorFromZone(value)`: Returns Tailwind text color class
- `getBackgroundColorFromZone(value)`: Returns Tailwind bg color class
- `getColorByMarketName(name)`: Governance→orange, Stable→green, Savings→blue, Volatile→pink

### marketv2/utils/index.ts
- `getLiquidityStatus(ratio)`: `<0.75` → green, `0.76-0.9` → yellow, `>0.91` → red
- `hasPositiveDebtCap(token)`: Checks if `token.getDebtCap(true) > 0`
- `isBorrowableTokenWithDebtCap(token)`: Type guard for BorrowableCToken with positive debt cap
- `tokenTaskGroupMap`: Maps task group names to token symbols (`'Kintsu Tasks'` → `'smon'`)

### app/utils/index.ts
- `mapRange(value, inMin, inMax, outMin, outMax)`: Linear interpolation
- `getSignature(address)`: Signs "I am the owner of: {address}", caches in localStorage
- `buildExplorerURL(chainId, txHash)`: Movement uses `/#/txn/{hash}?network=testnet`, others use `/tx/{hash}`
- `formatCVE(amount)`: `0`→`'0'`, `<0.01`→`'<0.01'`, else max 4 decimals
- `getFormattedWalletAddress(addr, left=6, right=3)`: Address truncation

### Hooks (market/hooks)
- `useTotalActivities()`: Aggregates all user positions → `{usdTotalCollateral, usdTotalDeposits, usdTotalLent, usdTotalBorrow}`
- `useWithdrawBalancePToken(token)`: Max withdraw considering collateral requirements
- `useWithdrawBalanceEToken(token)`: Max withdraw considering liquidity
- `useBorrowBalance(token)`: Available borrow = min(maxBorrow - debt, availableLiquidity)
- `useDebtValue(token)`: Returns min(debt, underlyingBalance)
- `useTransactionSteps({hasApproval, hasPlugin})`: State machine: plugin→approval→transaction→complete
- `useResetOnWalletChange(callback)`: Fires callback when wallet address changes

---

## Dead Code

### Confirmed Dead
| Path | Evidence |
|---|---|
| `old-pages/old-dashboard.tsx` | Feature-flagged out 3 months ago |
| `old-pages/old-index.tsx` | Feature-flagged out 3 months ago |

### Likely Dead (verify imports before deleting)
| Path | Last Touched | Evidence |
|---|---|---|
| `modules/market/icons/` | 2 years ago | "remove unused table modals" |
| `modules/market/components/market-overview-dialog.tsx` | 2 years ago | Likely superseded |
| `modules/market/components/market-overview-card.tsx` | 9 months ago | Only light mode pass |
| `modules/dashboard/enums/` | 2 years ago | Never updated |
| `modules/dashboard/models/` | 2 years ago | Never updated |
| `modules/dashboard/index.ts` | 2 years ago | Barrel never updated |

### NOT Dead Despite Age
| Path | Why Alive |
|---|---|
| `modules/market/components/borrow/` | Active transaction flow |
| `modules/market/components/deposit/` | Active deposit flow |
| `modules/market/components/withdraw/` | Active withdraw flow |
| `modules/market/components/repay/` | Active repay flow |
| `modules/market/components/manage-collateral/` | Active |
| `modules/market/components/leverage-slider.tsx` | Used in deposit modal |
| `modules/market/components/transaction-steps.tsx` | Active transaction UI |

---

## Market Detail Design Decisions

### Typography Scale (8 tiers, dark background optimized)

| Tier | Size | Use |
|---|---|---|
| Input value | 26px | Amount input field |
| Chart headline | 24px bold | Primary value in all chart tab headers |
| Token header | 19px bold | Token name in market info panels |
| Token pills | 16px | Token selector buttons |
| Section labels | 14px semibold uppercase | COLLATERAL, DEPOSITS, BORROW headings |
| Body / row labels | 13px | Position rows, metric labels, APY labels |
| Section context | 12px | "You pay in", "Borrowable", USD conversions |
| Badge / micro | 11px | InfoIcon, tertiary annotations |

**Rule:** 11px is the absolute floor. Section labels that were 11px got bumped to 12px for readability on dark backgrounds.

### Chart Header Contract (all 4 tabs standardized)

```
24px bold value   [DeltaBadge md]        ← same across all tabs
⊙ WETH  ⊙ USDC   context text           ← same token pills
```

- **Overview**: `$74.5M` + `▲ 2.8%` → tokens + `Deposits · 30d`
- **Deposit APY**: `15.07%` + `▲ 43.5%` → tokens + `30d`
- **Borrow APR**: `5%` + `▲ 108.3%` → tokens + `30d`
- **IRM**: `72.0%` + `Normal` → tokens + `Deposit 1.97% · Borrow 3.04%`

When adding a new chart tab, match this structure exactly.

### Stat Card Micro Visuals (final layout)

```
[Total Deposits ⓘ    ▲ 2.8%]   [Liquidity ⓘ    ━━● 71%]   [Deposit APY ⓘ    ▲ 2.1%]
[$155.7M              ]   [$110.5M              ]   [20%                  ]
```

- Total Deposits + Deposit APY: `DeltaBadge` (md size) showing 7-day change
- Liquidity: `LiquidityBadge` (md size) with health-coded fill bar (green ≥30%, yellow 10-29%, red <10%)
- Available % = `(1 - totalBorrowed/totalDeposits) × 100`

### Sidebar Dimensions

- 320px width, 10px border-radius, 12px padding
- Ghost pill inputs (no recessed wells)
- Free-floating APY headline at 20px bold
- Advanced details: rotating chevron, 3 rows (health, position, debt)
- Zapper: right-aligned balance (matches main input), white/25 opacity

### Leverage Slider Layout

```
1x ━━━━━●━━━ [5.6x]
```

- "1x" label inline left of track (13px, white/30)
- Input field doubles as max indicator — no redundant label row
- Max computed client-side: `1 / (1 - LTV/100)`, rounded to 1 decimal
- Shared `computeMaxLeverage` helper between sidebar and leverage tab

### Market Info Panels

- No vertical divider between token cards (card borders + backgrounds handle separation)
- `gap-3` between cards (matches stat card gap above)
- `pt-3.5 pb-2` card padding

---

## Sidebar Reuse Decisions

What was and wasn't reused from v1 `modules/market/components/`, with rationale:

| v1 Component | Decision | Rationale |
|---|---|---|
| `LeverageSlider` (218 lines) | ❌ Built lighter | Touch handling bloat, `LEVERAGE_VALUES=[1,20,60,80,100]` percentages not multipliers — needs translation layer |
| `ApprovalButton` + `transaction-steps.tsx` | ⏳ Phase 6 | Will reuse for CTA transaction flow |
| `useBalancePriceTokenQuery` | ⏳ Phase 6 | Will wire for real balances |
| `useMaxLeverageQuery` | ❌ Not needed | Replaced with client-side `computeMaxLeverage` from LTV |
| `useTokenStore` / `useDepositStore` | ⏳ Phase 6 | Sidebar state management |
| `usdFormatter` / `tokenFormatter` | ⏳ Phase 6 | Currently inline `.toLocaleString()` |
| `Stats` (StatCard) | ❌ Built custom | Too generic — no micro-viz slot. Built `MarketStatCard` instead |
| `TokenSelect` (Ariakit combobox) | ❌ Built `TokenPills` | Combobox overkill for 2 tokens |
| `amount-card.tsx` | ❌ Built fresh | Our input has denomination toggle + quick-fill |
| `Popover` | ❌ Simpler hover | `onMouseEnter/Leave` pattern lighter than Radix portal |

Sidebar 4 states (no wallet, wallet+no position, position+no input, position+amount entered) are documented in `MigrationPlan_V1Releases.md` → Release 3 sidebar wiring.

---

## Loading States

| Component | Loading | Empty / No Wallet |
|---|---|---|
| Stat cards | ✅ Pulse skeleton built (3 cards) | Show $0 / 0% |
| Charts | Skeleton rectangle with pulse | "No data available" centered |
| Market info sections | Skeleton rows (ring + text) | Show zeros |
| Sidebar balance | Skeleton text | "Connect wallet" |
| Sidebar position summary | Skeleton rows | Hidden entirely |
| IRM chart | Skeleton rectangle | "IRM data unavailable" |
| Leverage chart | Show chart with default $10K/1x | — |
