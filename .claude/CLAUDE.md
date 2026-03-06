# Curvance Contract SDK

## Critical Constraints

- **ethers v6.** Never mix v5 patterns (`BigNumber`, `Contract.connect(signer)`).
- **Decimal.js** for all numeric math. Never use native JS `Number` for token amounts, prices, or rates.
- **Bulk-loaded cache model.** `setupChain()` fetches all data upfront; class getters read from cache synchronously.
- **No SSR.** SDK is client-side only — assumes browser `window` and wallet provider.

## Reference Documents

Read these **on-demand** when the topic is relevant. Do not load all at once.

| File | When to read | What it contains |
|---|---|---|
| `Skill_CurvanceSDK.md` | **Any SDK class work, method calls, type usage, or error handling.** | Hard constraints, type system, method conventions, error handling rules. |
| `Skill_CurvanceApp.md` | Working on app integration or query hooks that consume the SDK. | App-side module architecture, routing, component patterns. |
| `Skill_UIPatterns.md` | UI work that renders SDK data. | Detection heuristic and checklist for avoiding AI-generated UI patterns. |
| `Skill_AerariumUI.md` | Aerarium-specific UI components. | Aerarium UI conventions and patterns. |
| `Skill_CurvanceQA.md` | Testing or debugging SDK behavior. | QA workflow, test patterns, debugging strategies. |

### Quick lookup guide

- **"What's the SDK method for X?"** → Read `Skill_CurvanceSDK.md`
- **"How do Market/CToken classes work?"** → Read `Skill_CurvanceSDK.md`
- **"How does the app consume this?"** → Read `Skill_CurvanceApp.md`

  