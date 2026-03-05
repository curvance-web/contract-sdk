---
name: curvance-qa
description: "Use when triaging display bugs, reviewing PRs against a bug tracker, running browser QA on app.curvance.com, or classifying symptoms by owning layer (app vs SDK vs contract). Triggers: 'bug hunt', 'QA session', 'review this PR', 'trace this display issue', 'check the dashboard', browser exploration for issues, any session focused on finding or fixing frontend bugs. Compose with Skill_CurvanceApp.md for codebase navigation and Skill_CurvanceSDK.md for SDK method behavior. Do NOT use for feature development, UI design, or Solidity/protocol work."
---

# Curvance QA

Rules for finding, tracing, and classifying frontend bugs. Read before any QA session, PR review, or display bug investigation.

## Diagnostic Trace (the core method)

Every display bug has a root in one layer. Trace backward from symptom until the value diverges from expected:

```
UI component (renders wrong value)
  → query hook (transforms SDK return)
    → SDK method (reads from .cache or RPC)
      → .cache (bulk-loaded at setup)
        → ProtocolReader (on-chain data)
```

**Fix lives at the layer where value diverges.** Don't fix downstream of the root — the symptom will resurface differently. When you find the divergent layer, grep for the same operation done correctly elsewhere in the codebase. The correct file is both proof of the bug and the fix template.

## Bug Ownership

| Divergence layer | Owner | Example |
|---|---|---|
| Component renders SDK return incorrectly | App bug | `getUserCollateral(false)` displayed as assets (shares ≠ assets) |
| Query hook transforms value wrong | App bug | `current.plus(preview.newDebt)` when `newDebt` is already total |
| SDK method returns wrong value from correct cache | SDK bug | `expectedShares: BigInt(quote.min_out)` — assets passed as shares |
| SDK method reads wrong cache field | SDK bug | Input token decimals used for output amount |
| Cache populated wrong by ProtocolReader | Contract/reader bug | (rare — verify with on-chain call) |

**When both layers contribute:** Track as separate bugs per layer. Each gets its own fix. Example: DISPLAY-010 was three bugs converging (SDK-002 + CVEBugs-2009 + DISPLAY-006).

## Display Bug Patterns

Five recurring patterns — check for these first, they cover ~80% of display bugs:

**1. Share/asset confusion.** `getUserCollateral(false)` returns shares, not assets. At exchangeRate > 1, shares < assets. Any display showing shares with an asset label understates the real value. Grep for `getUserCollateral(false)` in display code — every hit is suspicious.

**2. Total vs delta.** SDK preview methods (`previewLeverageUp`, `previewLeverageDown`) return totals, not deltas. `current.plus(preview.newDebt)` double-counts. Look for any `current.plus(preview.X)` — verify X is a delta, not a total.

**3. Loading defaults.** Any value shown before an async query resolves can be wrong. The dangerous ones alarm users: `?? Decimal(0)` for debt (shows $0), `positionHealth` sentinel 0 (shows 0.00% on Loans tab), sentinel 9.99 (shows ∞ on Deposits tab). Correct pattern: fall back to cached SDK value (`?? token.getUserDebt(true)`), not to zero.

**4. Stale cache vs live query.** Two components showing the same data may use different sources: one reads `market.userDebt` (page-load snapshot), the other reads `debtBalanceQuery.data` (real-time on-chain). They diverge by unaccrued interest.

**5. Null propagation from external APIs.** When KyberSwap or other external APIs reject a request, the result propagates as null. Any `.toString()` or property access on the null result crashes. Check error handling on every external API consumption path.

## PR Review Against Bug Tracker

1. Load the bug tracker (`BugFixes_Curvance_2.md`). Note unfixed bugs and their file locations.
2. For each changed file in the PR diff, match to tracked bugs. Every hunk should map to a known bug or be flagged as untracked.
3. **Untracked changes need investigation** — they're undocumented fixes (add to tracker) or new code introducing risk (check for new bugs).
4. **Check SDK version dependencies.** If a PR references SDK fields/methods (e.g., `newCollateral`, `newCollateralInAssets`), verify they exist in the deployed SDK version. Missing fields return `undefined`.
5. After review, update the bug tracker with status changes and any new bugs discovered.

## Browser QA Rules

- **Always use `app.curvance.com`** for production QA. Vercel preview URLs (`*.vercel.app`) may be different branches with different bug states.
- **Check loading states explicitly.** Reload the page and watch the first 5 seconds. Values that flash wrong before settling are loading-default bugs.
- **Check both tabs.** Dashboard Deposits and Loans tabs use different components with different default values — bugs may appear in one but not the other.
- **Check mobile viewport.** Some components have mobile-only rendering paths (`flex lg:hidden`) with separate bugs from desktop.
- **Note exact values.** "Wrong" isn't actionable. Record: expected value, actual value, ratio between them (ratios reveal the bug pattern — 2.6x ratio = leverage multiplier applied twice).

## Converging Bugs

Before investigating a new symptom, check if known unfixed bugs explain it. If multiple tracked bugs contribute to the same symptom, defer investigation and retest after fixes merge. Document the convergence in the tracker so the next session doesn't re-investigate.

Signals of convergence: the symptom only appears in flows that touch multiple known-buggy code paths; the wrong value's ratio to the expected value matches a known bug's error factor.

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| Reviewing a value displayed during loading | Assume only the final resolved value matters | Check the default/fallback — `?? Decimal(0)` or sentinel values are potential user-panic triggers |
| Seeing `getUserCollateral(false)` in display code | Assume it returns asset-denominated tokens | Returns shares — multiply by exchangeRate for asset value, or use `(true)` for USD |
| Seeing `current.plus(preview.something)` | Assume preview returns a delta | Check SDK source — preview methods often return totals. `current + total` double-counts |
| A PR changes a file not in any tracked bug | Accept as cleanup | Flag as untracked — could be undocumented fix or introduce new issues |
| Symptom matches multiple known bugs | Investigate as a new standalone bug | Check if converging unfixed bugs explain it. Defer and retest after fixes merge |
| Starting to trace a display bug | Jump into the component's render logic | Trace backward: component → hook → SDK method → cache. Find the divergent layer first |
| QA on a Vercel preview URL | Assume it matches production | Use `app.curvance.com` — preview branches may have different code or be broken entirely |
| External API call fails (KyberSwap 4000, etc.) | Assume the SDK handles errors | Check for null guards between API response and first property access. Missing guards → crash |

## References

**File:** `Reference_CurvanceQA.md` (165 lines)

| Section | Lines | Description |
|---|---|---|
| Correct Pattern Registry | 7-39 | Verified correct vs wrong implementations — grep targets for debt fallback, collateral conversion, health preview, zap approval |
| Display Bug Pattern Catalog | 40-91 | Five recurring patterns with detection greps, root causes, and known instances (51 lines, all behavioral) |
| QA Page Checklist | 92-134 | Per-page items: Dashboard tabs, Market detail sidebar, leverage flow, mobile viewport |
| PR Review Workflow | 135-149 | Step-by-step: load tracker → match hunks → flag untracked → check SDK deps → update tracker |
| Known Sentinel Values | 150-165 | Default values during loading — which are safe vs which alarm users |

**Cross-references:**

| Topic | File |
|---|---|
| Codebase navigation, module structure | Skill_CurvanceApp.md |
| SDK method signatures, WIGGW for SDK calls | Skill_CurvanceSDK.md |
| SDK data flow, query hooks, action patterns | Reference_CurvanceSDK.md |
| Bug tracker (current state) | BugFixes_Curvance_2.md |
