# Liquidation System Reference

Deep reference for Aerarium's v2 batch liquidation architecture. Consult specific sections as needed.

---

## Architecture Overview

Single entry point `liquidate(uint256 instructions, bytes calldata accounts)`. Permissionless, batch-processes accounts, amortizes oracle reads/cache/transfers.

### Function Decomposition

| Function | Purpose | Notes |
|----------|---------|-------|
| `liquidate()` | Entry: decode, loop, seizure, settlement | External, 2 args |
| `_assessHealth()` | Credit-based health, returns 0 if healthy | Internal. Populates collShares/debtBalance as side effects |
| `_detectBadDebt()` | Post-seizure recovery check | Cold path (intensity == BPS only). Accumulates `liq.totalBadDebt` |
| `_loadLiqCache()` | Populate per-asset cache, accrue interest | 3 args: `(liq, assetId, entryPtr)` |
| `_settleLiquidation()` | Totals, bad debt socialization, callback, transfers | CEI ordering |

### Flow Summary

```
liquidate(instructions, accounts)
  ├─ Decode → marketId, collAssetId, debtAssetId, liquidatorAcctId
  ├─ Build LiqTokenCache (5 words/asset, lazy-loaded)
  ├─ Compute: threshold, band = threshold - minHealth, minLoanSize
  ├─ Account Loop (stride 8 best-effort, 24 exact)
  │   ├─ Validate: ascending order, bitmap has targeted coll+debt
  │   ├─ _assessHealth → intensity (0 = healthy, BPS = max distress)
  │   ├─ Curves (concave/convex/linear) + stress amplification
  │   ├─ Bonus + close ratio → target health clamp
  │   ├─ Dust ceiling: remainder < minLoanSize → full balance
  │   ├─ Seizure: assets → shares, cap at collShares
  │   ├─ Bad debt (intensity == BPS only): _detectBadDebt
  │   └─ Write victim coll/debt slots
  ├─ Post-loop: debtRepaid/seizedShares/seizedAssets != 0
  └─ _settleLiquidation: totals, haircut, callback, transfers
```

---

## Memory Layouts

### LiqContext (22 words)

Ordered by access frequency (0x00 = cheapest). Fields 0x40–0xA0 form contiguous **zero block** (4 words) cleared via `calldatacopy` per iteration.

For exact field offsets and access counts: request `Aerarium.sol` (LiqContext struct, lines 148-174).

**Key fields (by role):**
- **Inner loop comparisons:** collAssetId (0x00), debtAssetId (0x20)
- **Zero block (per-iteration):** collShares, debtBalance, creditThenBonus, totalDebt
- **Cross-account accumulators:** totalDebtRepaid, totalCollShares
- **Constants:** marketId, cacheBase, threshold, band, minLoanSize
- **Storage pointers:** collSlot, debtSlot, liqCollSlot (write-before-read)

`creditThenBonus` (0x80) is repurposed: starts as `Σ(value × lltv)`, becomes bonus stash after targetHealth consumes credit.

### LiqTokenCache (5 words per entry, stride 0xA0)

Lazy-loaded per asset (`packedConfig == 0` sentinel). Assembly-allocated (no zero-init, no length word).

For exact constants: request `AerariumConstants.sol` (lines 95-107).

```
Word 0: packedConfig     — sentinel + lltv@LSB[13:0] + incentiveMult@[71:56] + address@high160
Word 1: totalShares|totalAssets (128|128)
Word 2: price            (256, full)
Word 3: totalsSlot       (storage pointer)
Word 4: globalIndex      (120, pre-masked)
```

### Callback Interface

```solidity
function onLiquidationNotify(address debtUnderlying, uint256 debtRequired, address collUnderlying, uint256 collReceived) external;
```

Fires after all state changes, before transfers. Reports `collReceived` as asset equivalent regardless of receive mode.

---

## Instruction Encoding

For exact bit positions: request `AerariumConstants.sol` or see Skill_AerariumTesting → instruction builders.

**Summary:**
```
Bit 255:       payFromWallet
Bits 252-221:  marketId (32)
Bits 220-217:  collAssetId (4)
Bits 216-213:  debtAssetId (4)
Bits 212-149:  liquidatorAcctId (64)
Bit 148:       callback
Bits 147-146:  receiveMode (0=supply, 1=redeem→balance, 2=redeem→wallet)
Bit 145:       isExact
```

**Variable reuse**: After decode, `instructions` repurposed as stride. All isExact checks become `instructions == EXACT_MODE_STRIDE`. Original recovered via `calldataload(4)`.

### Account Calldata

Best-effort: `[accountId: uint64]` (8 bytes). Exact: `[accountId: uint64][debtAmount: uint128]` (24 bytes). Strictly ascending order enforced.

---

## Health Computation (_assessHealth)

### Credit Model (v2)

Single accumulator: **Credit** = `Σ(collateralValue_i × lltv_i)` with deferred BPS division. `lltv` at LSB of `packedConfig` — single `and(mload(entryPtr), MASK_14)`, no shift.

**Total debt** = `Σ(debtBalance_j × price_j / ORACLE_PRECISION)`, rounded up.

**Healthy**: `credit ≥ totalDebt × threshold`.
- Normal: threshold = BPS (10000)
- Auction manager: threshold = BPS + auctionEdge (any account with debt is liquidatable)

**Band** = `threshold - minHealth` — distress range.

### Position Bitmap Iteration

CLZ-based extraction — cost scales with actual positions, not max 16.

### Overflow Safety

`value(≤128) × lltv(14) = 142 bits/term × 16 positions = 146 bits`. Safe in uint256.

### Intensity

```
if credit >= totalDebt × threshold:  intensity = 0
else:
    distress = totalDebt × threshold - credit
    maxDistress = totalDebt × band
    intensity = min(ceil(distress × BPS / maxDistress), BPS)
```

### Intensity Curves

| Mode | Formula | Effect |
|------|---------|--------|
| 0 (linear) | identity | Default |
| 1 (concave) | `2x − x²/BPS` | Aggressive early (stable pairs) |
| 2 (convex) | `x²/BPS` | Gentle early (volatile pairs) |

All map `[0, BPS] → [0, BPS]`. `curveMode` from market config bits `[15:14]`.

### Stress Amplification

After curve, before bonus: `intensity = min(intensity × stress / BPS, BPS)`. `stress == BPS` = no-op (calm). Managed via `manageStress()`.

### Auction Manager Threshold

When `_privileges[sender] & PRIV_AUCTION_MANAGER != 0`: threshold inflated to `BPS + auctionEdge`. Any account with debt is liquidatable. One `_privileges` SLOAD (warm after first).

---

## Seizure Computation

### Bonus

```
rawBonus = baseIncentive + extraIncentive × intensity / BPS    // market-level
bonus = rawBonus × incentiveMult / BPS                          // per-token scaling
```

`incentiveMult` (16 bits) at `[71:56]` of packedConfig. Conservative tokens (stables) can have lower incentives.

### Close Ratio

```
closeRatio = baseCloseRatio + (BPS - baseCloseRatio) × intensity / BPS
debtAmount = debtBalance × closeRatio / BPS
```

### Target Health Clamp

```
denom = th × BPS − (BPS + bonus) × lltv_coll
if denom > 0:
    shortfall = totalDebt × th − credit
    targetAmt = ceil(shortfall / denom) × ORACLE_PRECISION / debtPrice
    debtAmount = min(debtAmount, targetAmt)
```

Self-calibrating: small shortfall → small liquidation. If `denom ≤ 0` (healing rate non-positive), clamp skipped — requires `th × BPS > (BPS + bonus) × lltv_coll`.

### Dust Ceiling

Best-effort only: if remainder < minLoanSize, bump to full repayment.

### Seizure Amount

```
seizureAssets = debtAmount × debtPrice × (BPS + bonus) / (collPrice × BPS)
seizureShares = seizureAssets <= totalAssets ? toSharesUp(...) : totalShares
```

**Branching:** `seizureShares > collShares` → exact: revert `Insufficient`; best-effort: invert formula, cap at collShares.

### Bad Debt Detection

Only when `intensity == BPS`. Uses post-seizure collateral values:
```
For each collateral token:
    recovery += value × BPS² / (BPS² + totalInc × incentiveMult_i)
remainingDebtUSD = totalDebt - debtAmount × debtPrice / OPREC
if remainingDebtUSD > maxRecovery:
    badDebtAssets = min(ceil(gap × OPREC / debtPrice), debtBalance - debtAmount)
```

---

## Settlement (_settleLiquidation)

### Market Debt Totals + Bad Debt Socialization

`newMarketDebt = marketDebt - (totalDebtRepaid + totalBadDebt)`. If `totalBadDebt > 0`: reduce debt token's `totalAssets` (supply-side haircut). Emits `BadDebtRecognized`.

### Receive Modes

| Mode | Destination | Market Totals | Notes |
|------|-------------|--------------|-------|
| 0 (supply credit) | Supply shares to liquidator position | No change | Cheapest: single SSTORE |
| 1 (redeem→balance) | Internal account balance | Reduced | Capped by available liquidity |
| 2 (redeem→wallet) | ERC20 transfer | Reduced | Most expensive |

### Redeem Overflow (Mode 1/2, Best-Effort)

If `redeemAssets > availableLiquidity`: best-effort credits overflow as supply shares (mode 0 fallback). Exact mode: revert `InsufficientLiquidity`.

### Callback + Transfers (CEI)

1. Callback after state changes, before transfers
2. Debt in: transferFrom (wallet) or account balance deduction
3. Collateral out: mode 1 → balance credit, mode 2 → transfer

---

## Stack Depth and Variable Reuse

Liquidation-specific techniques applied in `liquidate()`. For the general technique catalog see `Reference_EvmPatterns.md` → "Stack Too Deep".

**Function extraction:** `_assessHealth` (inner loop → own frame, returns intensity, side-effects collShares/debtBalance/slots), `_detectBadDebt` (cold path, intensity == BPS only), `_settleLiquidation` (callback + distribution), `_loadLiqCache` (3-arg).

| Variable | First life | Second life | Recovery |
|----------|-----------|-------------|---------|
| `instructions` | Packed instruction word | Stride (8 or 24) | `calldataload(4)` |
| `intensity` | Raw health factor | Post-curve intensity | Preserved for bad debt gate |
| `creditThenBonus` | `Σ(value × lltv)` | Bonus stash | Written after targetHealth |

**Zero block:** LiqContext 0x40–0xA0 (4 words) batch-cleared per iteration via `calldatacopy`.
