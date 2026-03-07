---
Deep lookup reference for Curvance frontend QA. Consult specific `##` sections as needed via the reference table in `Skill_CurvanceQA.md`.
---

# Curvance QA Reference

## Correct Pattern Registry

When tracing a display bug, grep for the same operation done correctly elsewhere. These are the verified-correct implementations:

**Debt display fallback:**
- Correct: `borrow-table.tsx` L2020 — `debtBalanceQuery.data ?? token.getUserDebt(true)` (cached snapshot as fallback)
- Wrong: `LoansTable.tsx` L91 — `debtBalanceQuery.data ?? new Decimal(0)` (shows $0 during loading)

**Collateral in asset terms:**
- Correct: `withdraw.content.tsx` L44-51 — computes `exchangeRate = assetBalance.div(shareBalance)`, then `collateralAssets = collateralShares.mul(exchangeRate)`
- Correct (USD→tokens): `LoansTable.tsx` L170-171 — `getUserCollateral(true).div(getPrice(true))`
- Wrong: `manage-collateral.content.tsx` L496 — `getUserCollateral(false)` raw (shares labeled as assets)
- Wrong: `dashboard.tsx` L3161-3165 — same issue, mobile-only path (`flex lg:hidden`)

**Position size for edit leverage:**
- `deposit.content.tsx` uses `useDepositPositionSize` which branches on `isEditLeverage`:
  - Increasing: `previewLeverageUp(newLev, debtToken)` → `{ newCollateral }` (USD)
  - Decreasing: `current × newLev / currentLev` (proportional)
  - New deposit: `calculatePositionSize(tokenAmount, leverage)` + current

**Debt preview for edit leverage:**
- Correct decrease: `market.ts` L413-424 — `currentDebt × (newLev-1) / (currentLev-1)`
- Wrong increase: `market.ts` L390 — `current.plus(debt?.newDebt)` — double-counts because `newDebt` is total, not delta

**Health factor preview gating:**
- Current (buggy): `deposit.content.tsx` L2314 — `hasAmount ? (isEditLeverage ? ... : ...) : undefined`
- `hasAmount` requires `debouncedAmount > 0`. Edit leverage adjusts slider without entering an amount → `hasAmount = false` → health preview hidden
- Fix direction: check `isEditLeverage` before `hasAmount`

**Success modal deposit amount:**
- Symptom: modal shows total position size (e.g. "13,341 WMON deposited") instead of the deposit input amount (e.g. "1 WMON deposited"). Affects all deposits into existing positions, not just zaps.
- Root cause (dev): `TransactionCompleted` used `useDepositPositionSize` → `token.getUserAssetBalance(true)` which reads from cache refreshed by `reloadUserData` post-deposit — returns **total** position, not the deposit amount. Appeared correct for first deposits (total ≈ input) but broke for subsequent deposits.
- Root cause (production): used `depositTokenAmounts` selector which self-canceled to the correct input amount via matching price round-trip. Dev replaced this with `positionSize.current.token`.
- Fix: pass `submittedAmount` (snapshotted via `useState` before mutation at L164/L626 in `deposit.tsx`) as prop to `TransactionCompleted`. Display `submittedAmount` directly instead of computing from live cache. Symbol stays as `token.asset.symbol` (underlying — correct for WMON display).

**Zap deposit approval + inputToken:**
- Correct: `token.isZapAssetApproved(instructions, amount)` / `token.approveZapAsset(...)` for zap paths
- Wrong: `dashboard-v2/queries/index.ts` L192-196 — checks `asset.allowance(account, token.address)` for all paths, uses `asset.address` as `inputToken` even for zaps

## Display Bug Pattern Catalog

### Pattern 1: Share/Asset Confusion

**Signature:** Displayed value is less than expected by a factor of `exchangeRate`. Example: shows 1000 when actual is 1100 (exchangeRate 1.1).

**Detection grep:** `getUserCollateral(false)` in any file under `components/` or `pages/`. Every hit in display code is suspicious.

**Root cause:** `getUserCollateral(false)` returns raw cToken shares from `collateralPosted()`. Shares ≠ assets when exchangeRate > 1 (always true after any interest accrual).

**Known instances:**
- `manage-collateral.content.tsx` L496 (remove path)
- `dashboard.tsx` L3161-3165 (mobile collateral row)
- `manage-collateral.content.tsx` L505 (TransactionSummary — stores shares in variable named `usdAmount`)

### Pattern 2: Total vs Delta

**Signature:** Displayed value is roughly `current + expected` instead of just `expected`. Example: debt shows $15k instead of $10k (double-counted $5k current debt).

**Detection:** Look for `current.plus(preview.X)` or `currentValue + sdkReturnValue`. Check SDK source — if the return value is already a total, adding to current double-counts.

**SDK methods that return totals (not deltas):**
- `previewLeverageUp().newDebt` — total debt at target leverage = `equity × (newLev - 1)`
- `previewLeverageUp().newCollateral` — total collateral at target leverage = `equity × newLev`

**SDK methods that return deltas:**
- `previewLeverageUp().borrowAmount` — additional borrow needed = `newDebt - currentDebt`

### Pattern 3: Loading Defaults

**Signature:** Value flashes wrong for 1-5 seconds on page load, then resolves to correct value.

**Detection:** Search for `?? new Decimal(0)`, `?? 0`, `?? null` as query fallbacks. Check what the user sees during the loading window.

**Severity rule:** If the default would alarm users (0% health, $0 debt, $0 balance), it's a real bug even though it resolves. If the default is neutral (skeleton, null → hidden), it's acceptable.

**Known instance — zap token switch:** `useDepositError` reads `useBalancePriceTokenQuery` which refetches on zap token change. During loading, `rawTokenBalance` falls to `'0'` → triggers `no_balance` error → "Insufficient balance" flashes. Fix: guard with `!isBalanceLoading` before returning `no_balance`.

### Pattern 4: Stale Cache vs Live Query

**Signature:** Two displays of the same data show slightly different values. Difference equals interest accrued since page load.

**Detection:** Compare data sources — `market.userDebt` (page-load snapshot from `setupChain`) vs `debtBalanceQuery.data` (real-time on-chain fetch). Components using the snapshot diverge from components using the live query.

**Severity:** Usually P3 (sub-cent for most positions). Escalate only if the discrepancy is user-visible in the same viewport.

### Pattern 5: Null Propagation from External APIs

**Signature:** Crash with `Cannot read properties of null (reading 'toString')` or similar.

**Detection:** Trace back to the API call that returned null. Common: KyberSwap `quote()` returns null on rejection (code 4000 — amount too small or bad pair). No null guard before `.min_out.toString()` or `.routerAddress`.

**Fix pattern:** Add null guard between API response and first property access. Throw descriptive error rather than letting null propagate silently.

## QA Page Checklist

### Dashboard (`/dashboard`)

**Overview cards (always visible):**
- Total Rewards, Portfolio Value, Deposits, Debt — check values match sum of individual positions
- Change indicators (daily earnings) — verify sign and direction

**Deposits tab:**
- Position list: deposit amount, collateral, leverage ratio, APY, position health
- Loading state: watch for ∞ health on leveraged positions during first 5 seconds (sentinel 9.99 → ∞)
- Expand a position: check Available to Withdraw, liquidation price, collateral cap, LTV, health bar
- Sort columns: verify sort order matches displayed values (share/asset confusion in sort accessor)

**Loans tab:**
- Loan list: debt amount, interest rate, position health
- Loading state: watch for 0.00% health during first 5 seconds (sentinel 0 → 0.00% "Danger")
- Expand a position: check debt details, repay availability

**History tab:** Transaction history rendering, pagination

**Rewards tab:** Merkl rewards aggregation, claimable amounts

### Market Detail (`/market?address=0x...`)

**Sidebar actions:** Deposit, Borrow, Withdraw, Repay — each has its own component and query hooks
- Check input validation (min amounts: $10 deposit, $10.10 borrow)
- Check approval flows (ERC20 + plugin where applicable)
- Check TransactionSummary values (watch for share/asset confusion)
- Check success modal values (position size, health factor)

**Leverage flow:**
- Edit leverage: slider adjusts leverage on existing position
- Position size preview: should match actual result
- Debt preview: total-vs-delta bug risk
- Health preview: should appear for both increase AND decrease

### Mobile Viewport

- Components with `flex lg:hidden` or `hidden lg:flex` have separate rendering paths
- Check collateral displays specifically — mobile paths have had share/asset bugs
- Check that expanded position details render correctly at narrow widths

### Bytes Game (`/bytes`)

**Game state transitions:**
- Default (countdown) → Running (multiplier climbing) → Cashout or Busted
- Verify multiplier display updates smoothly without stale values
- Verify "Busted" text renders in red, multiplier freezes at crash value

**Multiplier color tiers:**
- Test at each boundary: 1.20x, 1.50x, 2.00x, 5.00x, 10.00x, 25.00x, 50.00x, 100.00x
- Each boundary should trigger a color shift matching the tier system
- Rainbow/gradient flash at 100.01x+ (if observable)

**Bet controls:**
- MAX bet: should trigger confirmation popup showing Bytes amount, not auto-submit
- Auto Cashout: toggle on, set target multiplier, verify fires at correct value
- Bet amount persistence: does amount survive between rounds?

**Edge cases:**
- Insufficient balance: enter amount > balance, verify error state and disabled Bet button
- Disconnect wallet mid-game: verify controls disable, no crash
- Pending bet cancellation: place bet during countdown, cancel before round starts
- Repeat bet with depleted balance: after a win/loss that brings balance below bet amount

**Recent Multiplier sidebar:**
- Scrolls with new entries
- Colors match tier system
- Username truncation doesn't clip icons

**Mobile:**
- All game states render correctly at narrow viewport
- Bet controls stack vertically
- Bottom sheet for MAX confirmation
- "How it works" modal renders as bottom sheet

### Partner Tasks (Notification Panel)

**Task auto-detection:**
- Complete each protocol action (deposit, collateralize, borrow, repay)
- Verify corresponding checkbox fills without manual refresh
- Check timing: immediate detection vs polling delay

**Accordion behavior:**
- Expand/collapse each partner section
- Verify chevron rotates, no content jump or clipping
- Multiple accordions open simultaneously — verify layout handles it

**Badge count:**
- Red badge on Tasks tab should show accurate count of incomplete tasks
- Decrement on task completion
- Disappear entirely when all tasks done (count = 0)

**Completion flow for each partner:**
1. All 4 tasks checked → partner accordion shows `Done` badge (replaces `New`)
2. Snackbar appears at bottom of main content area (not inside notification panel)
3. Celebration modal displays (if enabled) — badge icon with radial burst
4. Partner badge in badge collection section shows as earned

**Tab switching:**
- Switch between Tasks / Transactions / Inbox
- State persists across tab switches (no task resets)
- Tab content loads without flicker

**Desktop layout:**
- Dropdown overlay right-aligned from bell icon
- ~320px width, doesn't shift page content
- Dismiss: click outside or ✕

**Mobile layout:**
- Full-width bottom sheet overlay
- Footer shows "Rewatch Intro" + "Feedback" buttons
- Version label visible: `Curvance v0.2.0 Beta`
- Swipe down to dismiss

**Light/Dark mode (mobile):**
- Mobile notification panel has explicit light variant
- Verify readable contrast in both themes
- Badge colors (green `New`, muted `Done`) visible in both

## PR Review Workflow

1. **Check known bugs** — note unfixed bugs and their file paths
2. **List changed files** in the PR diff
3. **For each file:**
   - Does it appear in any tracked bug's file path? If yes, verify the diff matches the documented fix
   - If the fix deviates from the documented approach, verify correctness independently
   - If the file doesn't appear in any tracked bug, flag as untracked change
4. **For untracked changes:**
   - Read the diff closely — is it a new fix? Document it and add to tracker
   - Is it a refactor? Check it doesn't introduce new bugs
   - Is it a feature? Out of scope for bug review, note and move on
5. **Check SDK dependencies** — if the PR references SDK fields like `newCollateral`, `newCollateralInAssets`, `adjustMaxLeverage`, verify they exist in the deployed SDK version
6. **Update tracker** — mark fixed bugs, add newly discovered bugs, update status

## Known Sentinel Values

| Field | Default/Sentinel | Displayed as | Risk |
|---|---|---|---|
| `market.positionHealth` (no debt) | `Decimal(9.99)` | ∞ | Low — ∞ is correct for no-debt positions, misleading for leveraged positions during loading |
| `market.positionHealth` (loading) | `null` or `0` | 0.00% | **High** — implies imminent liquidation, could panic users. Deposits tab and mobile have ∞ fallback (correct). LoansTable desktop `PositionHealthCell` was `?? 0` — fixed to truthiness check + InfinityIcon |
| `debtBalanceQuery.data` (loading) | `null` | Depends on fallback | **High if `?? Decimal(0)`** — shows $0 debt. Safe if `?? token.getUserDebt(true)` |
| `positionHealthPercentage ≥ 999` | Clamped to `9.99` | >999% | Safe — just a display cap |
| `positionHealthPercentage` | `null` when no wallet | ∞ | Safe |
| `maxRedemption` (loading) | Skeleton | Loading indicator | Safe — skeleton is appropriate |
| `formatPositionHealth` (UINT256_MAX) | Huge Decimal → >999% | >999% instead of ∞ | **Fixed in SDK 3.5.9** — now checks `UINT256_MAX` and returns `null`. Prior versions: preview health queries show >999% for no-debt positions |

**Health status thresholds (from `getStatus()`):**
- `< 5` → Danger (red)
- `5–20` → Caution (yellow)
- `> 20` → Healthy (green)
- `null` → Healthy (default)
