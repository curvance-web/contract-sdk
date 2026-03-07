# Curvance Contract SDK

## Critical Constraints

- **ethers v6.** Never mix v5 patterns (`BigNumber`, `Contract.connect(signer)`).
- **Decimal.js** for all numeric math. Never use native JS `Number` for token amounts, prices, or rates.
- **Bulk-loaded cache model.** `setupChain()` fetches all data upfront; class getters read from cache synchronously.
- **No SSR.** SDK is client-side only — assumes browser `window` and wallet provider.

## Skills

Read these **on-demand** when the topic is relevant. Do not load all at once. Each skill may point to a companion `Reference_*.md` for deep lookup — load that only when the skill directs you to.

| Skill | When to read | What it contains |
|---|---|---|
| `Skill_CurvanceSDK.md` | **Any SDK class work, method calls, type usage, or error handling.** | Hard constraints, type system, method conventions, error handling rules. |
| `Skill_CurvanceApp.md` | Working on app integration, query hooks, or v1 frontend codebase navigation. | App-side module architecture, routing, component patterns. |
| `Skill_CurvanceV1.md` | Working on or navigating the `curvance-app-v2` v1 frontend codebase. | Hard constraints, module architecture, build/deploy conventions. |
| `Skill_UIPatterns.md` | Building or reviewing any frontend UI, detecting AI-generated patterns. | Detection heuristic and checklist for avoiding AI-generated UI patterns. |
| `Skill_AerariumUI.md` | Building, reviewing, or styling Curvance/Aerarium frontend UI components. | Aerarium UI conventions, color tokens, component patterns. |
| `Skill_CurvanceQA.md` | Triaging display bugs, running browser QA, classifying symptoms by layer. | QA workflow, bug triage, layer classification strategies. |
| `Skill_CurvanceBrand.md` | Creating marketing materials, lander pages, brand assets, partner proposals. | Brand identity, two-tier visual system, color/typography rules. |

## Reference Documents

Deep lookup companions to skills. Only load when a skill directs you to a specific section.

| Reference | Companion skill | What it contains |
|---|---|---|
| `Reference_CurvanceSDK.md` | `Skill_CurvanceSDK.md` | Full API reference — classes, method signatures, data shapes. |
| `Reference_CurvanceApp.md` | `Skill_CurvanceApp.md` | Tech stack, directory structure, module deep dives. |
| `Reference_CurvanceV1.md` | `Skill_CurvanceV1.md` | V1 codebase deep reference — modules, stores, hooks. |
| `Reference_CurvanceQA.md` | `Skill_CurvanceQA.md` | QA deep reference — bug patterns, triage checklists. |
| `Reference_UIPatterns.md` | `Skill_UIPatterns.md` | Full AI-tell pattern catalog with code examples and fixes. |
| `Reference_Liquidation.md` | — | Aerarium v2 batch liquidation architecture. |

### Quick lookup guide

- **"What's the SDK method for X?"** → Read `Skill_CurvanceSDK.md`
- **"How do Market/CToken classes work?"** → Read `Skill_CurvanceSDK.md`
- **"How does the app consume this?"** → Read `Skill_CurvanceApp.md`
- **"How does the v1 codebase work?"** → Read `Skill_CurvanceV1.md`
- **"This looks AI-generated"** → Read `Skill_UIPatterns.md`
- **"Brand colors / marketing page"** → Read `Skill_CurvanceBrand.md`
