---
name: curvance-sdk
description: "Use when reading, calling, extending, or debugging the Curvance contract-sdk (curvance npm package). Triggers: writing SDK functions, calling SDK methods from v1 app, understanding data flow from chain to UI, working with Market/CToken/BorrowableCToken classes, formatting on-chain values, building new query hooks, debugging SDK errors. Compose with Skill_CurvanceApp.md for app integration. Do NOT use for Solidity/protocol contract work or Aerarium v2 clean-slate frontend."
---

# Curvance SDK (contract-sdk)

Rules for working with the SDK. Read before calling any SDK method, writing query hooks, or extending SDK classes.

## Hard Constraints

- **ethers v6 only.** Do not mix v5 patterns.
- **Decimal.js for all user-facing math.** Precision 50, `ROUND_DOWN` convention. Never use native JS `Number` for token amounts or prices.
- **bigint for all on-chain values.** Conversion to `Decimal` at the boundary via `FormatConverter`.
- **Global mutable state.** `setupChain()` writes `setup_config` and `all_markets` (module-level). Every class reads them. `setupChain()` must run before anything else.
- **Bulk-loaded data model.** `setupChain()` → `Market.getAll()` loads ALL data from ProtocolReader in a single batch. Populates `.cache` on every `CToken` and `Market`. Getters read synchronously. On mutations, `oracleRoute` calls `market.reloadUserData()`. `fetch*` methods make targeted RPC calls. Cache field inventory in Reference → Data Shapes.
- **All writes go through `oracleRoute()`.** Encodes calldata → checks Redstone price updates → wraps in multicall if needed → sends tx → reloads user data. Never call `contract.*` directly.
- **`contractWithGasBuffer` Proxy wraps all contracts.** Auto-estimates gas + 10% buffer. All contract calls are async.

## Type System

Six semantic type aliases in `types.ts`:

| Type | Underlying | Meaning | Example |
|---|---|---|---|
| `address` | `` `0x${string}` `` | Ethereum address | `0x3bd3...` |
| `bytes` | `` `0x${string}` `` | Raw calldata | `0xabcd...` |
| `TokenInput` | `Decimal` | Human-readable token amount — needs `decimalToBigInt(value, decimals)` before on-chain use | `Decimal(1.5)` |
| `USD` | `Decimal` | USD value at human scale (value / 1e18) | `Decimal(100.50)` |
| `USD_WAD` | `bigint` | USD in WAD format (1e18) — raw on-chain | `100500000000000000000n` |
| `Percentage` | `Decimal` | Fractional (0.75 = 75%). Multiply by 100 for display | `Decimal(0.75)` |

**Conversion rule of thumb:** Passing to contract → `bigint`. Displaying to user → `Decimal`/`USD`/`Percentage`.

## BPS Convention

On-chain values use basis points (1 BPS = 0.01% = 1e-4). Constants: `BPS = 10000n`, `WAD = 1e18n`, `SECONDS_PER_YEAR = 31536000n`. BPS getter: `Decimal(cache.collRatio).div(BPS)` → `Percentage`. Rate→APY: `Decimal(cache.supplyRate).div(WAD).mul(SECONDS_PER_YEAR)`. Full constants in Reference → Type System & Constants.

## Data Flow: Chain → UI

```
setupChain(chain, provider, approval_protection=false, api_url)
  ├── getContractAddresses(chain)       // from chains/*.json
  ├── new ProtocolReader(addr) + OracleManager(addr)
  ├── Api.getRewards()                  // milestones + incentives
  ├── Market.getAll(reader, oracle, ...)
  │     ├── reader.getAllMarketData(user)  // 3 parallel RPC calls
  │     ├── per token: merge static+dynamic+user → new CToken/BorrowableCToken
  │     └── attach milestones/incentives + fetch native yields
  └── return { markets, reader, dexAgg, global_milestone }
```

V1 app wraps this in `useSetupChainQuery()`. All other hooks use `select` on this query — no separate RPC calls.

## Class Hierarchy

```
Calldata<T>           (abstract — getCallData, executeCallData)
  └── CToken          (collateral — deposit, redeem, leverage, zap)
        └── BorrowableCToken  (adds borrow, repay, IRM, liquidity)

ERC20 → ERC4626      (basic token → vault extension)
Market                (orchestrator — CToken[], health, snapshots)
ProtocolReader        (multicall reader)    FormatConverter (static bigint↔Decimal)
OracleManager         (price fetching)      PositionManager (leverage calldata)
Zapper (swap+deposit) Redstone (price updates) NativeToken (MON/ETH)
Api (rewards, yields)  OptimizerReader (vault reads)
```

Full class APIs in Reference → Market/CToken/BorrowableCToken API sections. Format helpers, integrations (Merkl, Snapshot), and yield calculation helpers in Reference → Format Module, Rewards/Incentives, Yield Calculation Helpers.

## Writing New Query Hooks

Synchronous data (from `.cache`) → `select` on `useSetupChainQuery`. Async SDK calls → separate `useQuery` with `enabled` guard. Always include `token?.address` and `account.address` in queryKey. Never call `setupChain()` outside `useSetupChainQuery`. Code templates in Reference → V1 Consumption Layer.

## V1 Mutation Rules

Every write follows: `Zustand store → useMutation (calls SDK) → invalidateUserStateQueries`. Full mutation flows in Reference → V1 Action Patterns. Key rules per operation:

| Operation | Critical Rule |
|---|---|
| Borrow | `token.borrow(Decimal(amount), walletAddress)` — amount is Decimal, not bigint |
| Repay | ≥99.9% of debt → `isPayingAll=true` → `token.repay(Decimal(0))`. Zero means "repay all" |
| Withdraw | Clamp to `token.maxRedemption()` — never exceed |
| Deposit+Leverage | Approve underlying to **position manager address**, NOT cToken |
| Leverage Up | `getHighestPriority(token.leverageTypes)` → `approvePlugin` → `leverageUp` |
| Leverage Down | **Always** `'simple'` type — vault/native-vault types throw |
| Deposit (zap) | `inputToken`: zapping → `zapToken.interface.address`, else → `asset.address` |
| Collateral Add | `postCollateral()` **THROWS** if user has outstanding debt — check debt first |

**Invalidation:** `invalidateUserStateQueries(queryClient)` → invalidates: `['setupchain']`, `['positionHealth']`, `['balance']`, `['zap-tokens','balance']`, `['user-debt']`

**Protocol constants:** `MIN_DEPOSIT_USD = 10`, `MIN_BORROW_USD = 10.1` (SDK `format/leverage.ts`), `MIN_ACTIVE_LOAN_SIZE = 10e18` (on-chain), `MARKET_COOLDOWN_LENGTH = 20 min` (on-chain)

## Conversion Decision Tree

1. **User types a number** → `TokenInput` (Decimal). Store as-is.
2. **Sending to SDK method** → pass Decimal directly. SDK handles conversion internally.
3. **Sending to contract directly** (rare) → `FormatConverter.decimalToBigInt(amount, token.asset.decimals)` for assets, `token.convertTokenInputToShares(amount)` for shares.
4. **Displaying contract data** → `FormatConverter.bigIntToDecimal(value, decimals)`. `asset.decimals` for assets, `token.decimals` for shares.
5. **Displaying USD** → `FormatConverter.bigIntToUsd(wadValue)` or getter with `(true)`: `token.getUserAssetBalance(true)`.
6. **Cross-token math** → `token.convertTokenToToken(from, to, amount, true)` for display, `false` for on-chain.

## Transaction Flow Checklist

1. **Approval check** — call allowance check, prompt approval if needed, **`await tx.wait()`** before proceeding
2. **Plugin approval** (if zap/leverage) — `isPluginApproved()` → `approvePlugin()` if needed, wait for confirmation
3. **Call SDK method** — pass Decimal amounts, SDK handles calldata + oracleRoute
4. **Handle TransactionResponse** — `await tx.wait()`, then invalidate queries
5. **Error handling** — SDK throws strings: insufficient approval, collateral cap exceeded, stale oracle price, no signer, wrong leverage direction

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| Display a token amount | Use `Number()` or raw bigint division | `FormatConverter.bigIntToDecimal(value, decimals)` |
| Pass amount to contract | Pass `Decimal` directly | `FormatConverter.decimalToBigInt(amount, token.asset.decimals)` |
| Get asset price | `token.getPrice()` (returns share price by default) | `token.getPrice(true)` for asset price, `(false)` for share price |
| Write to contract | `this.contract.deposit(assets, receiver)` | `this.getCallData("deposit", [...])` → `this.oracleRoute(calldata)` |
| Check if token is borrowable | `token.isBorrowable` then cast | Type is already `BorrowableCToken` if `isBorrowable` — Market constructor handles this |
| New query hook | Create new `setupChain()` call | `useSetupChainQuery({ select: ... })` |
| Get USD value of tokens | Manually multiply price × amount | `token.convertTokensToUsd(bigintAmount)` or `FormatConverter.bigIntTokensToUsd(...)` |
| Rate to APY | Divide by WAD | Divide by WAD **then multiply by SECONDS_PER_YEAR** |
| Utilization rate to percentage | Divide by WAD then × SECONDS_PER_YEAR | Divide by WAD **only** — utilization is NOT annualized |
| User's remaining borrow capacity | Calculate from collateral/debt manually | `market.userRemainingCredit` (already has 0.1% buffer) |
| Position health display | Use raw bigint | `market.formatPositionHealth(bigint)` → `Decimal` (0 = liquidation, null = ∞) |
| getLiquidity(false) | Expect Decimal | Returns `bigint` — must wrap: `toDecimal(token.getLiquidity(false), token.asset.decimals)` |
| Deposit approval target | Approve to position manager | Approve to `token.address` (the cToken itself) |
| depositAndLeverage approval target | Approve to cToken (like regular deposit) | Approve to **position manager address** |
| Dashboard change rates | Call `getUserDepositsChange()` without arg | Must pass rate: `getUserDepositsChange('day')` |
| Which decimals for conversion | Use one or the other without knowing | `token.decimals == asset.decimals` always (ICToken.sol). Convention: `asset.decimals` for user amounts, `token.decimals` for shares — either works numerically |
| FormatConverter rounding | Expect standard rounding | ALWAYS truncates (ROUND_DOWN + floor). `Decimal(1.999)` with 8 decimals → `199999999n` |
| CToken.getPrice() vs ERC20.getPrice() | Same behavior | CToken is **synchronous** (bulk-loaded `.cache`). ERC20 is **async** (on-chain oracle call) |
| Slippage for dex vs position manager | Same scale | Dex: raw BPS (`500n` = 5%). Position manager: WAD (`5e16n` = 5%). SDK converts via `FormatConverter.bpsToBpsWad(bps)` |
| Implementing a mutation requiring approvals | Assume SDK internal guards are a safety net | `approval_protection` defaults `false`. App-side checks are the only gate |
| Approval types | One approval flow | Three types: (1) ERC20 allowance, (2) plugin delegate (`setDelegateApproval`), (3) zap asset approval. Each checked separately |
| Displaying deposit APY to user | `getApy()` (base supply rate only — excludes incentives and native yield) | `getTotalSupplyRate()` for all-in rate (supply + incentiveSupplyApy + nativeApy). For borrow: `getTotalBorrowRate()` |
| Expected shares on zap/leverage | Use `virtualConvertToShares` everywhere | `leverageUp` and `depositAndLeverage` both use `virtualConvertToShares(BigInt(quote.min_out))` for simple type. Vault types use `getVaultExpectedShares` two-hop conversion. Exchange-rate drift can still cause `BaseZapper__ExecutionError` — decode error selector first |

## References

**File:** `Reference_CurvanceSDK.md` (2869 lines)

| Section | Lines | Description |
|---|---|---|
| V1 Action Patterns (Write Operations) | 653-804 | Full mutation flows: borrow, repay, withdraw, deposit, leverage up/down, collateral, dashboard (151 lines, all behavioral) |
| Standalone Leverage Mutations | 1352-1543 | Leverage flows, action structs, contract callbacks, V2 app bugs (191 lines, all behavioral — high ROI) |
| Format Module (v3.6.3) | 2579-2686 | Pure-function helpers: leverage validation, borrow calc, collateral breakdown, health formatting, amounts |
| Yield Calculation Helpers (v3.6.3) | 2755-2781 | getNativeYield, getInterestYield, getMerklDepositIncentives, getDepositApy, getBorrowCost |
| Transaction Execution Architecture | 1915-2006 | Full pipeline: input → calldata → zap → approvals → oracleRoute → gas buffer → send |
| Approval Architecture | 2007-2138 | Three approval types, approval_protection flag, v2 patterns, per-operation sequences |
| Shares ↔ Assets Conversion Pipeline | 1858-1914 | Three layers (virtual/on-chain/user-input), which methods take assets vs shares |
| Slippage Handling | 2238-2359 | Four-layer contract protection, WAD format, protocol fee |
| Repay Mechanics | 2188-2237 | fetchDebtBalanceAtTimestamp, full-repay detection (99.9%), allowance buffer |
| ProtocolReader API | 314-401 | On-chain reads, position health formula, max leverage calc, price asymmetry rule |
| Market API | 118-188 | Properties, user data, preview methods |
| Market Computed Properties | 1056-1113 | Aggregate/user properties, change rates, borrow eligibility, health formatting |
| New Market Properties (v3.6.3) | 2821-2858 | totalCollateral, ltv, plugins, getBorrowableCTokens, reloadMarketData, previewAssetImpact, incentive APYs, getAll data-loading sequence |
| CToken API | 189-258 | Overload pattern, write caveats, leverage previews, oracleRoute internals |
| CToken Synchronous Getters | 1114-1219 | Balance getters, price overloads, risk params, leverage state, token conversion, APY, composite rates |
| BorrowableCToken API | 259-313 | Debt, rates, IRM, liquidation |
| BorrowableCToken Extended API | 1220-1304 | Rate getters, liquidity, safety overrides, async borrow methods, IRM access |
| FormatConverter Complete API | 1692-1773 | All static methods, precision behavior, BPS/WAD utilities |
| Data Shapes (ProtocolReader types) | 85-117 | Field semantics, WAD scaling, enums, UserData.locks, cache field inventory |
| V1 Consumption Layer | 620-652 | useSetupChainQuery + derived hooks, query hook templates |
| Api Class (v3.6.3) | 2687-2710 | Rewards API, native yields API, response types |
| OptimizerReader (v3.6.3) | 2711-2738 | Optimizer vault reads: market data, user data, optimal deposit/withdrawal, rebalance |
| Snapshot Integration (v3.6.3) | 2739-2754 | Portfolio snapshot: snapshotMarket, takePortfolioSnapshot |
| Market Metadata Types (v3.6.3) | 2782-2797 | MarketCategory, CollateralSource, CATEGORY_META, PROTOCOL_META |
| Additional Constants (v3.6.3) | 2798-2820 | BPS_SQUARED, WAD_BPS, RAY, SECONDS_PER_*, DEFAULT_SLIPPAGE_BPS, NATIVE_ADDRESS |
| ERC4626 Vault Layer | 2360-2429 | cTokens ARE ERC4626, vault-backed two-layer chain, expected shares calc |
| maxRedemption Deep-Dive | 2139-2187 | 7 overloads, buffer/breakdown, dust sweep, v2 withdraw pattern |
| Setup Flow | 8-84 | Bootstrap sequence, sanitization, priority market selection |
| Deposit Mutation (useDepositV2Mutation) | 1305-1351 | useDepositV2Mutation: zap + plugin approval + deposit/depositAsCollateral flow |
| Dashboard Queries | 1544-1605 | Overview, deposit list, loan list, balance, position health, rewards |
| Cooldown System | 1606-1627 | cooldown getter, expiresAt(), multiHoldExpiresAt() |
| Position Preview Methods | 1628-1674 | previewPositionHealth family, previewLeverageUp return shape |
| Type System & Constants | 1774-1828 | Semantic types, all constants, helper aliases, curvance_provider/curvance_signer |
| Decimal System | 1829-1857 | token.decimals == asset.decimals proof, SDK convention |
| Helpers (src/helpers.ts) | 569-609 | Constants + utility functions |
| Store Architecture | 805-840 | Zustand stores (deposit, borrow, manage-collateral) |
| Validation Hooks | 841-874 | Borrow, repay, deposit, collateral |
| Leverage Utilities | 875-900 | Max leverage calc |
| Position Preview Hooks | 901-926 | Size, debt, health previews |
| Leverage Flow | 974-1013 | Leverage/deleverage mutation sequence |
| Write Pattern (oracleRoute) | 1014-1036 | Oracle route / multicall pattern |
| Zap Flow (deposit with token swap) | 953-973 | Deposit with token swap |
| Borrow Utilities | 927-940 | Available borrow, debt balance |
| Collateral Utilities | 941-952 | Remaining cap, balance calc |
| Rewards / Incentives | 1037-1055 | Merkl rewards, milestones, native yields, integrations (Merkl, Snapshot) |
| Redstone Oracle Integration | 2430-2474 | Automatic price update prepend, multicall wrapping |
| Zapper Architecture | 2475-2514 | Type mapping, calldata by type, deposit token discovery |
| ensureUnderlyingAmount Safety Check | 2550-2578 | Silent balance cap — getZapBalance resolves input token by zap type |
| Token Task Group Map | 1675-1691 | Gamification task matching pattern |
| FormatConverter API | 402-422 | Method catalog |
| ERC20 API | 423-435 | Data model, overload notes |
| ERC4626 API | 436-441 | Vault extension |
| OracleManager API | 442-451 | Oracle management |
| NativeToken API | 452-469 | Native token wrapping |
| PositionManager API | 470-497 | Position management |
| Zapper API | 498-522 | Zap routing |
| Calldata API | 523-533 | Calldata builder |
| Redstone API | 534-546 | Oracle wrapper |
| DexAggregators API | 547-568 | Quote flow (KyberSwap, Kuru) |
| Retry Provider | 610-619 | Config |
| ERC20 API Patterns | 2515-2549 | balanceOf overloads, approve, sync vs async price |
| New Market Constructor (v3.6.3) | 2859-2869 | DeployData interface, deploy key lookup |

**Cross-references:**

| Topic | File |
|---|---|
| App codebase, module map, queries, transaction UI | Skill_CurvanceApp.md + Reference_CurvanceApp.md |
| UI/design conventions, color tokens | Skill_AerariumUI.md + Reference_AerariumUI.md |
| Display bug patterns, QA checklists | Skill_CurvanceQA.md + Reference_CurvanceQA.md |
