---
name: curvance-sdk
description: "Use when reading, calling, extending, or debugging the Curvance contract-sdk (curvance-web/contract-sdk v3.5.3). Triggers: writing SDK functions, calling SDK methods from v1 app, understanding data flow from chain to UI, working with Market/CToken/BorrowableCToken classes, formatting on-chain values, building new query hooks, debugging SDK errors. Compose with Skill_CurvanceV1.md for v1 app integration. Do NOT use for Solidity/protocol contract work or Aerarium v2 clean-slate frontend."
---

# Curvance SDK (contract-sdk v3.5.3)

Rules for working with the SDK. Read before calling any SDK method, writing query hooks, or extending SDK classes.

## Hard Constraints

- **ethers v6 only.** SDK uses `ethers` v6 (`Contract`, `JsonRpcProvider`, `JsonRpcSigner`). Do not mix v5 patterns.
- **Decimal.js for all user-facing math.** Precision set to 50. Never use native JS `Number` for token amounts or prices. `Decimal.ROUND_DOWN` is the convention everywhere.
- **bigint for all on-chain values.** Raw contract returns are `bigint`. Conversion to `Decimal` happens at the boundary via `FormatConverter`.
- **Global mutable state.** `setup_config` and `all_markets` are module-level mutables in `setup.ts`. `setupChain()` writes them. Every class reads them. This means SDK has implicit initialization order — `setupChain()` must run before anything else.
- **Bulk-loaded data model.** `setupChain()` → `Market.getAll()` loads ALL market, token, and user data from ProtocolReader in a single batch of RPC calls. This populates `.cache` on every `CToken` and `Market`. Getters read this bulk-loaded data synchronously — no per-read RPC calls. On mutations (deposit, borrow, etc.), `oracleRoute` calls `market.reloadUserData()` to refresh user-specific fields. Methods prefixed `fetch*` make targeted RPC calls and update specific `.cache` fields. Future evolution: static market data will move to an API layer for multi-chain support.
- **All writes go through `oracleRoute()`.** Every state-changing CToken method encodes calldata → checks for Redstone price updates → wraps in multicall if needed → sends transaction → reloads user data. Never call `contract.*` directly for writes.
- **`contractWithGasBuffer` Proxy wraps all contracts.** Every contract instantiated via `contractSetup()` gets a Proxy that auto-estimates gas and adds a 10% buffer. This is invisible but means all contract calls are async even if they don't look it.

## Type System

Six semantic type aliases — all defined in `types.ts`. Understanding these is critical for knowing when conversion is needed:

| Type | Underlying | Meaning | Example |
|---|---|---|---|
| `address` | `` `0x${string}` `` | Ethereum address | `0x3bd3...` |
| `bytes` | `` `0x${string}` `` | Raw calldata | `0xabcd...` |
| `TokenInput` | `Decimal` | Human-readable token amount (e.g., `1.5 WBTC`) — needs `decimalToBigInt(value, decimals)` before on-chain use | `Decimal(1.5)` |
| `USD` | `Decimal` | USD value at human scale (value / 1e18) | `Decimal(100.50)` |
| `USD_WAD` | `bigint` | USD in WAD format (1e18) — raw on-chain | `100500000000000000000n` |
| `Percentage` | `Decimal` | Fractional (0.75 = 75%). Multiply by 100 for display. | `Decimal(0.75)` |

**Conversion rule of thumb:** If you're passing to a contract → convert to `bigint`. If you're displaying to a user → convert to `Decimal`/`USD`/`Percentage`.

## BPS Convention

On-chain values use basis points (1 BPS = 0.01% = 1e-4). Constants:

| Constant | Value | Use |
|---|---|---|
| `BPS` | `10000n` | Divide raw BPS value to get Percentage |
| `WAD` | `1e18n` | Divide raw WAD value to get human-readable |
| `SECONDS_PER_YEAR` | `31536000n` | Convert per-second rates to APY |

**Pattern for BPS getters:** `Decimal(cache.collRatio).div(BPS)` → `Percentage`
**Pattern for rate→APY:** `Decimal(cache.supplyRate).div(WAD).mul(SECONDS_PER_YEAR)` → `Percentage`

## Data Flow: Chain → UI

```
setupChain(chain, provider)
  ├── getContractAddresses(chain)          // from chains/*.json
  ├── new ProtocolReader(addr)
  ├── new OracleManager(addr)
  ├── fetch rewards API                    // milestones + incentives
  ├── Market.getAll(reader, oracle, ...)
  │     ├── reader.getAllMarketData(user)   // 3 parallel RPC calls
  │     │     ├── getStaticMarketData()    // token config, risk params
  │     │     ├── getDynamicMarketData()   // prices, rates, liquidity
  │     │     └── getUserData(account)     // balances, debt, health
  │     ├── for each market:
  │     │     ├── merge static + dynamic + user per-token
  │     │     ├── new CToken() or new BorrowableCToken() based on isBorrowable
  │     │     └── attach milestones/incentives
  │     └── fetch native yields API
  └── return { markets, reader, dexAgg, global_milestone }
```

**The v1 app wraps this in a single React Query hook:**
```ts
useSetupChainQuery() → queryFn: setupChain() → sanitizeMarketNames() → prioritizeDefaultMarket()
```
All other hooks use `select` on this query — no separate RPC calls for basic data.

## Class Hierarchy

```
Calldata<T>           (abstract — getCallData, executeCallData)
  └── CToken          (collateral tokens — deposit, redeem, leverage, zap)
        └── BorrowableCToken   (adds borrow, repay, IRM access, liquidity)

ERC20                 (basic token — balanceOf, approve, transfer)
  └── ERC4626         (vault extension — convertToShares, previewDeposit)

Market                (orchestrator — holds CToken[], position health, snapshots)
ProtocolReader        (multicall reader — batches on-chain reads)
OracleManager         (price fetching — getPrice with error codes)
FormatConverter       (static — bigint↔Decimal, USD↔tokens, BPS↔WAD)
PositionManager       (leverage/deleverage calldata building)
Zapper                (swap+deposit calldata for zap flows)
Redstone              (price update multicall actions)
NativeToken           (native chain token — MON/ETH, no contract)
```

## Bulk-Loaded Data Structure

`CToken.cache` is a spread-merge of 3 ProtocolReader types (all populated at setup via bulk RPC load):

```
StaticMarketToken:  address, name, symbol, decimals, asset, adapters, isBorrowable,
                    borrowPaused, collateralizationPaused, mintPaused,
                    collateralCap, debtCap, isListed,
                    collRatio, maxLeverage, collReqSoft, collReqHard,
                    liqInc{Base,Curve,Min,Max}, closeFactor{Base,Curve,Min,Max}

DynamicMarketToken: exchangeRate, totalSupply, totalAssets, collateral, debt,
                    sharePrice, assetPrice, sharePriceLower, assetPriceLower,
                    borrowRate, predictedBorrowRate, utilizationRate, supplyRate, liquidity

UserMarketToken:    userAssetBalance, userShareBalance, userUnderlyingBalance,
                    userCollateral, userDebt, liquidationPrice
```

**Collision warning (source comment L84 of Market.ts):** These are spread-merged. Field name collisions = silent data loss.

## Writing New Query Hooks

Pattern from the v1 consumption layer (`modules/marketv2/queries/index.ts`):

```ts
// 1. ALWAYS derive from useSetupChainQuery with a select function
function getMyData(data: SetupChainData) {
  return data.markets.map(m => /* transform */);
}

export function useMyDataQuery() {
  return useSetupChainQuery({ select: getMyData });
}

// 2. For data needing async SDK calls, use a separate useQuery
export function useMyAsyncQuery(token: CToken | null) {
  const account = useAccount();
  return useQuery({
    queryKey: ['myQuery', token?.address, account.address],
    queryFn: async () => {
      if (!token) return null;
      return token.someAsyncMethod();
    },
    enabled: !!token && !!account.address,
  });
}
```

**Rules:**
- Synchronous data (prices, rates, balances from bulk-loaded `.cache`) → `select` on `useSetupChainQuery`
- Async SDK calls (maxRedemption, hypotheticalBorrow, position previews) → separate `useQuery` with `enabled` guard
- Always include `token?.address` and `account.address` in queryKey
- Never call `setupChain()` outside of `useSetupChainQuery`

## Writing New SDK Methods

If extending CToken or BorrowableCToken:

1. **Read method (from bulk-loaded data):** Add a getter that reads from `this.cache`. Follow the overload pattern: `(inUSD: true): USD` / `(inUSD: false): bigint`.
2. **Read method (fresh RPC):** Prefix with `fetch`. Call `this.contract.*`, update `.cache` field, return.
3. **Write method:** Encode calldata via `this.getCallData("methodName", [args])`, then `return this.oracleRoute(calldata)`. Never call `this.contract.methodName()` directly for writes.
4. **Preview method:** Use `this.market.reader.getPositionHealth(...)` or similar ProtocolReader methods. These are view calls, no state change.

## V1 Action Patterns

Every write action follows this architecture:
```
Zustand store (state + validation hooks) → useMutation (mutationFn calls SDK) → invalidateUserStateQueries
```

**Invalidation after writes:**
```ts
invalidateUserStateQueries(queryClient) → invalidates: ['setupchain'], ['positionHealth'], ['balance'], ['zap-tokens','balance'], ['user-debt']
```

### Borrow
```
store: useBorrowStore — holds token (BorrowableCToken), amount, market
validation: useMaxBorrowAmount() → min(userRemainingCredit, remainingDebt, liquidity)
mutation: token.borrow(Decimal(amount), walletAddress)
```

### Repay
```
mutation flow:
  1. fetchDebtBalanceAtTimestamp() → get current debt
  2. If paying ≥99.9% → isPayingAll=true → token.repay(Decimal(0))  ← sends 0 to repay full
  3. Check allowance on underlying asset → approve if needed (unlimited vs exact)
  4. token.repay(Decimal(amount))
```

### Withdraw
```
mutation flow:
  1. token.maxRedemption() → get max
  2. token.redeem(min(amount, maxRedemption))  ← clamps to max
```

### Deposit with Leverage
```
store: useDepositStore — holds depositToken, borrowToken, leverage, slippage
mutation flow:
  1. Find debtToken: first token with getUserDebt(true) > 0, fallback to borrowToken
  2. Get leverageTypes via getHighestPriority(token.leverageTypes)
  3. Get positionManager = token.getPositionManager(leverageTypes)
  4. Check asset allowance → asset.approve(positionManager.address) if needed
  5. Check plugin approval → token.approvePlugin(leverageTypes, 'positionManager') if needed
  6. token.depositAndLeverage(amount, debtToken, Decimal(leverage), leverageTypes, slippage)
```

### Deposit (with optional zap)
```
store: useDepositStore — holds depositToken, borrowToken, zapToken, zapperType, slippage, isCollateralized
mutation flow (useDepositV2Mutation):
  1. If zapping (zap !== 'none') → check plugin approval → token.approvePlugin(zap, 'zapper')
  2. Check asset allowance on underlying → asset.approve(token.address) if needed
  3. Build ZapperInstructions: { type, inputToken: asset.address, slippage }
  4. If isCollateralized → token.depositAsCollateral(Decimal(amount), instructions, account)
     Else → token.deposit(Decimal(amount), instructions, account)
```

### Standalone Leverage Up (existing position, no new deposit)
```
mutation: useLeverageUpMutation({ depositToken, borrowToken })
flow:
  1. Find debtToken: first token with getUserDebt(true) > 0, fallback to borrowToken
  2. leverageTypes = getHighestPriority(depositToken.leverageTypes)
  3. depositToken.approvePlugin(leverageTypes, 'positionManager')
  4. depositToken.leverageUp(debtToken, newLeverage, leverageTypes, slippage)
```

### Standalone Leverage Down (reduce existing leverage)
```
mutation: useLeverageDownMutation(token)
flow:
  1. Find debtToken (same pattern)
  2. token.approvePlugin('simple', 'positionManager')
  3. token.leverageDown(borrowToken, currentLeverage, newLeverage, 'simple', slippage)
note: leverage-down always uses 'simple' type
```

### Collateral Add/Remove
```
add:  token.postCollateral(Decimal(amount))
remove: token.removeCollateral(Decimal(amount))
validation: useManageCollateralError() — checks exceeds_max, exceeds_max_redemption
SAFETY: BorrowableCToken.postCollateral() THROWS if user has outstanding debt
```

### Dashboard Data Access
```
useDashboardOverview() → select on setupChain → sums market.userDeposits, userDebt, userNet
  + change rates: market.getUserDepositsChange('day'), getUserDebtChange('day'), getUserNetChange('day')
useDepositDashboardQuery() → tokens where getUserAssetBalance(true) > 0
useLoanDashboardQuery() → borrowable tokens where getUserDebt(false) > 0
useBalanceQuery(token) → token.getAsset(true).balanceOf(account) → FormatConverter.bigIntToDecimal
```

### Protocol Constants
```
MIN_DEPOSIT_USD = 10         (frontend)
MIN_BORROW_USD = 10.1        (frontend)
MIN_ACTIVE_LOAN_SIZE = 10e18 (on-chain, ProtocolReader)
MARKET_COOLDOWN_LENGTH = 20 minutes (on-chain)
```

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| Display a token amount | Use `Number()` or raw bigint division | `FormatConverter.bigIntToDecimal(value, decimals)` |
| Pass amount to contract | Pass `Decimal` directly | `FormatConverter.decimalToBigInt(amount, token.asset.decimals)` |
| Get asset price | `token.getPrice()` (returns share price by default) | `token.getPrice(true)` for asset price, `token.getPrice(false)` for share price |
| Write to contract | `this.contract.deposit(assets, receiver)` | `this.getCallData("deposit", [...])` → `this.oracleRoute(calldata)` |
| Check if token is borrowable | `token.isBorrowable` then cast | Type is already `BorrowableCToken` if `isBorrowable` — Market constructor handles this |
| New query hook | Create new `setupChain()` call | Use `useSetupChainQuery({ select: ... })` |
| Get USD value of tokens | Manually multiply price × amount | `token.convertTokensToUsd(bigintAmount)` or `FormatConverter.bigIntTokensToUsd(...)` |
| Rate to APY | Divide by WAD | Divide by WAD **then multiply by SECONDS_PER_YEAR** |
| Utilization rate to percentage | Divide by WAD then multiply by SECONDS_PER_YEAR | Divide by WAD **only** — utilization is NOT annualized |
| User's remaining borrow capacity | Calculate from collateral/debt manually | `market.userRemainingCredit` (already has 0.1% buffer) |
| Position health display | Use raw bigint | `market.formatPositionHealth(bigint)` → returns `Decimal` (0 = liquidation threshold, null = ∞) |
| getLiquidity(false) | Expect Decimal | Returns `bigint` — must wrap: `toDecimal(token.getLiquidity(false), token.asset.decimals)` |
| Deposit approval target | Approve to position manager | Approve to `token.address` (the cToken contract itself) |
| Dashboard change rates | Call `getUserDepositsChange()` without arg | Must pass rate: `getUserDepositsChange('day')` |
| Which decimals for conversion | Use `token.decimals` for everything | `token.decimals` and `asset.decimals` are **always equal** (ICToken.sol: cToken decimals "matching the underlying token"). SDK uses both for semantic clarity. Convention: `asset.decimals` for user amounts, `token.decimals` for share amounts — either works numerically |
| FormatConverter rounding | Expect standard rounding | ALWAYS truncates (ROUND_DOWN + floor). `Decimal(1.999)` with 8 decimals → `199999999n`, NOT `200000000n` |
| CToken.getPrice() vs ERC20.getPrice() | Same behavior | CToken.getPrice() is **synchronous** (reads bulk-loaded `.cache`). ERC20.getPrice() is **async** (on-chain oracle call). Different code paths |
| Slippage for dex vs position manager | Same scale | Dex aggregator takes raw BPS (`500n` = 5%). Position manager contract takes slippage in WAD directly (`5e16n` = 5%). SDK converts via `FormatConverter.bpsToBpsWad(bps)`. Contract has FOUR layers: (1) dex minimum output, (2) `_swapSafe` oracle-price check in SwapperLib, (3) `checkSlippage` modifier (portfolio value), (4) per-operation min checks (expectedShares, repayAssets). Layers 1-2 are primary protection, 3-4 are safety nets |
| Protocol fee on leverage/deleverage | No fee | Contract applies `centralRegistry.protocolLeverageFee()` (in BPS) to every leverage/deleverage action. Fee deducted from effective borrow/collateral amount, sent to DAO. SDK expectedShares calculations don't account for this — checkSlippage catches value loss |
| repayAssets in DeleverageAction | Exact amount to repay | **Minimum floor only.** Contract repays `min(assetsHeld, totalDebt)` — always repays as much as possible, capped at total debt. Remaining tokens returned to user |
| expectedShares in leverageUp (simple) | Converted via convertToShares | **SDK BUG:** `BigInt(quote.min_out)` — raw dex output in ASSET terms, NOT converted to shares. Causes `InvalidSlippage` revert as exchange rate grows. `depositAndLeverage` does it correctly via `getExpectedShares()`. Fix: use same `getExpectedShares` pattern |
| Partial deleverage minRepay tolerance | Uses user-configured slippage | **Not a bug.** Hardcoded 5% is intentional defense-in-depth floor. User slippage enforced by dex quote + `_swapSafe` oracle check + `checkSlippage` modifier. The 5% `minRepay` is a sanity floor against oracle/dex price divergence |
| Deposit vs Collateral dashboard values | Show same number when fully collateralized | **V2 DISPLAY BUG:** Two conversion paths — deposits use `userAssetBalance × assetPrice` (on-chain convertToAssets), collateral uses `collateralPosted(shares) × sharePrice`. Rounding diverges. Fix: single conversion path |
| Repay preview "after" amount | Matches displayed current debt | **V2 DISPLAY BUG:** Display uses `debtBalanceQuery` (real-time on-chain), preview uses `market.userDebt` (stale snapshot). Diverge by unaccrued interest since page load |
| Remove-collateral available balance | Shows asset amount | **V2 DISPLAY BUG:** `manage-collateral.content.tsx` L496 uses `getUserCollateral(false)` which returns shares, not assets. Compare `withdraw.content.tsx` which correctly applies exchangeRate |
| previewLeverageDown collateral reduction | Computes how much collateral to withdraw | **SDK BUG:** `notional.mul(newLeverage)` computes TARGET collateral level, passes it as withdrawal amount. Over-withdraws, contract's `checkSlippage` catches and reverts. Fix: `collateralInUsd.sub(notional.mul(newLeverage))` |
| useLeverageDownMutation borrow token | Passes user's actual debt token | **V2 BUG (dormant):** Finds `debtToken` then passes `borrowToken` from store. Dormant with 2-asset markets, breaks with multi-asset |
| ensureUnderlyingAmount behavior | Expect it to throw on insufficient balance | **Silently caps** deposit amount to user's balance and logs a console warning. No throw, no error. Deposit proceeds with reduced amount |
| Approval types | One approval flow | Three distinct types: (1) ERC20 allowance (spender+amount), (2) plugin delegate (setDelegateApproval), (3) zap asset approval (input token to plugin). Each checked separately |
| Token contract writes | Call contract methods directly | NEVER. Encode via `getCallData()` → `oracleRoute()`. Direct calls skip price updates, gas buffer, and post-tx user data reload |
| Redstone price updates | Manual price feed | Automatic. `oracleRoute()` checks token adapters → if REDSTONE_CORE, prepends price update via multicall. Transparent to consumers |
| Gas estimation | Set gasLimit manually | Automatic 10% buffer via `contractWithGasBuffer` Proxy on all contract instances. Silent fallback if estimation fails |
| maxRedemption result units | Always share count | Default (`maxRedemption()` or `in_shares=false`) returns **TokenInput** (Decimal in asset terms). Only `in_shares=true` returns bigint shares |
| Vault-backed token shares | Asset amount = cToken shares | Extra conversion layer: asset → vault.previewDeposit → vault shares → ctoken.convertToShares → cToken shares. cTokens ARE ERC4626 vaults; "vault-backed" means the cToken's underlying is itself a vault token (e.g., stETH) |
| Leverage-down position manager type | Use `getHighestPriority(leverageTypes)` like leverage-up | **Always** use `'simple'` — only simple position manager implements deleverage swap routing. Vault/native-vault types throw |
| Full deleverage (newLeverage=1) | Same path as partial deleverage | Different path: uses `fetchDebtBalanceAtTimestamp(100n, false)` for projected debt, adds 5 BPS buffer to collateral amount, uses exact debt as min repay |
| LeverageAction vs DeleverageAction | Same struct shape | `LeverageAction.swapAction` is singular `Swap`. `DeleverageAction.swapActions` is `Swap[]` array. Wrong shape causes encoding error |
| Expected shares calculation | Use `virtualConvertToShares` everywhere | Three different paths: (1) Zappers and `depositAndLeverage` use on-chain `convertToShares` (async). (2) `leverageUp` simple type uses raw `quote.min_out` directly (NOT converted). (3) Internal operations (redeem, postCollateral) use virtual (sync, from `.cache`). Vault types always use full `getVaultExpectedShares` two-hop conversion |
| BorrowableCToken deposit as collateral | Call depositAsCollateral like any CToken | **THROWS** if `cache.userDebt > 0` before any approval step runs. Must check debt in UI first. Same for `postCollateral()` |
| ensureUnderlyingAmount input token | Always checks underlying balance | Checks **zap input token** balance via `getZapBalance(zap)` — underlying for 'none', vault's raw asset for 'vault', native balance for 'native-*', custom inputToken for 'simple' zap objects |
| depositAndLeverage approval target | Same as regular deposit (approve to cToken) | Approve underlying to **position manager address**, NOT cToken. `_checkErc20Approval(asset, amount, manager.address)` |

## Conversion Decision Tree

When working with amounts in v1 code, follow this path:

1. **User types a number** → it's a `TokenInput` (Decimal). Store as-is.
2. **Sending to SDK method** (deposit, borrow, repay) → pass the Decimal directly. SDK handles conversion internally.
3. **Sending to contract directly** (rare, avoid) → `FormatConverter.decimalToBigInt(amount, token.asset.decimals)` for assets, `token.convertTokenInputToShares(amount)` for share-denominated calls.
4. **Displaying contract data** → `FormatConverter.bigIntToDecimal(value, decimals)`. Use `asset.decimals` for asset amounts, `token.decimals` for share amounts.
5. **Displaying USD** → `FormatConverter.bigIntToUsd(wadValue)` or use getter with `(true)`: `token.getUserAssetBalance(true)`.
6. **Cross-token math** → `token.convertTokenToToken(from, to, amount, true)` for display, `false` for on-chain.

## Transaction Flow Checklist

For any write operation in v1:

1. **Approval check** — call appropriate allowance check, prompt user for approval if needed, **wait for tx confirmation** (`await tx.wait()`) before proceeding
2. **Plugin approval** (if zap/leverage) — `isPluginApproved()` → `approvePlugin()` if needed, wait for confirmation
3. **Call SDK method** — pass Decimal amounts, SDK handles calldata encoding + oracleRoute
4. **Handle TransactionResponse** — `await tx.wait()` for confirmation, then invalidate queries
5. **Error handling** — SDK throws strings for: insufficient approval, collateral cap exceeded, stale oracle price, no signer, wrong leverage direction

## References

**File:** `Reference_CurvanceSDK.md` (2591 lines)

| Section | Lines | Description |
|---|---|---|
| V1 Action Patterns | 646-797 | Mutation architecture, full-repay detection (≥99.9% → send 0), allowance buffering (151 lines, all behavioral) |
| ProtocolReader API | 307-394 | On-chain reads, position health formula, max leverage calc, price asymmetry rule |
| Setup Flow | 8-84 | Bootstrap sequence, sanitization, priority market selection |
| Market API | 113-183 | Properties, user data, preview methods |
| Market Computed Properties | 1049-1106 | Aggregate and user properties, change rate methods, borrow eligibility, position health formatting |
| CToken API | 184-251 | Overload pattern, write caveats, leverage previews, oracleRoute internals — full signatures in `src/CToken.ts` |
| CToken Synchronous Getters | 1107-1204 | Balance getters, price overloads, risk params, leverage state, token conversion, APY |
| BorrowableCToken API | 252-306 | Debt, rates, IRM, liquidation |
| BorrowableCToken Extended API | 1205-1289 | Rate getters, liquidity, safety overrides, async borrow methods, IRM access |
| Data Shapes | 85-112 | Field semantics, WAD scaling, enums — full types in `src/types/protocolReader.ts` |
| Helpers | 562-602 | Constants + utility functions |
| V1 Consumption Layer | 613-645 | useSetupChainQuery + derived hooks |
| Deposit Mutation | 1290-1336 | useDepositV2Mutation: zap + plugin approval + deposit/depositAsCollateral flow |
| Standalone Leverage Mutations | 1337-1564 | Leverage up/down flows, action struct shapes, contract callbacks, **all known bugs** (SDK: expectedShares, previewLeverageDown; V2: display mismatches, dormant borrowToken). Load when debugging any leverage or display issue (227 lines, all behavioral — high ROI) |
| Dashboard Queries | 1565-1626 | Overview, deposit list, loan list, balance, position health, rewards aggregation |
| Cooldown System | 1627-1648 | cooldown getter, cooldownLength, expiresAt(), multiHoldExpiresAt() |
| Position Preview Methods | 1649-1695 | previewPositionHealth family, previewLeverageUp return shape |
| Token Task Group Map | 1696-1712 | Gamification task matching pattern |
| FormatConverter Complete API | 1713-1794 | All 11 static methods, precision behavior, rounding, BPS/WAD utilities |
| Type System & Constants | 1795-1845 | Semantic types (TokenInput, USD, USD_WAD, Percentage), all constants, helper function aliases |
| Decimal System | 1846-1872 | token.decimals == asset.decimals always (by contract design), SDK convention for semantic clarity |
| Shares ↔ Assets Conversion | 1873-1929 | Three layers (virtual/on-chain/user-input), which methods take assets vs shares, cToken ERC4626 insight |
| Transaction Execution Architecture | 1930-2021 | Full pipeline: input → calldata → zap → approvals → oracleRoute → gas buffer → send |
| Approval Architecture | 2022-2153 | Three approval types, approval_protection flag, v2 patterns, approval sequence per operation, convertToShares on-chain vs virtual vs raw |
| maxRedemption Deep-Dive | 2154-2202 | 7 overloads, buffer/breakdown, dust sweep in redeem(), v2 withdraw pattern |
| Repay Mechanics | 2203-2252 | fetchDebtBalanceAtTimestamp, full-repay detection (99.9%), 1% allowance buffer, amount=0 semantics |
| Slippage Handling | 2253-2374 | Four-layer contract protection (dex minimum + SwapperLib `_swapSafe` oracle check + `checkSlippage` portfolio modifier + per-op checks), WAD format, protocol fee, expectedShares inconsistency, leverage-down specials |
| ERC4626 Vault Layer | 2375-2444 | cTokens ARE ERC4626, vault-backed two-layer chain, expected shares calc, vault access methods |
| Redstone Oracle Integration | 2445-2489 | Automatic price update prepend, 3/4 signer payload, multicall wrapping |
| Zapper Architecture | 2490-2529 | Type mapping, calldata by type, deposit token discovery |
| ERC20 API Patterns | 2530-2564 | balanceOf overloads, approve (null=unlimited), sync vs async price, data model |
| ensureUnderlyingAmount | 2565-2591 | Silent balance cap on deposit — getZapBalance resolves input token by zap type, not always underlying |
| Leverage Flow | 967-1006 | Leverage/deleverage mutation sequence |
| Store Architecture | 798-833 | Zustand stores (deposit, borrow, manage-collateral) |
| Validation Hooks | 834-867 | Borrow, repay, deposit, collateral |
| Write Pattern | 1007-1029 | Oracle route / multicall pattern |
| Leverage Utilities | 868-893 | Max leverage calc |
| Position Preview Hooks | 894-919 | Size, debt, health previews |
| Zap Flow | 946-966 | Deposit with token swap |
| Borrow Utilities | 920-933 | Available borrow, debt balance |
| Collateral Utilities | 934-945 | Remaining cap, balance calc |
| Rewards / Incentives | 1030-1048 | Merkl rewards, milestones, native yields |
| FormatConverter API | 395-415 | Method catalog |
| ERC20 API | 416-428 | Data model, overload notes — standard methods in `src/ERC20.ts` |
| ERC4626 API | 429-434 | Vault extension — full methods in `src/ERC4626.ts` |
| OracleManager API | 435-444 | Oracle management |
| NativeToken API | 445-462 | Native token wrapping |
| PositionManager API | 463-490 | Position management |
| Zapper API | 491-515 | Zap routing |
| Calldata API | 516-526 | Calldata builder |
| Redstone API | 527-539 | Oracle wrapper |
| DexAggregators API | 540-561 | Quote flow (KyberSwap, Kuru) |
| Retry Provider | 603-612 | Config |
