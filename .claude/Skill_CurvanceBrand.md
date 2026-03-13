---
name: curvance-brand
description: "Use when creating marketing materials, lander pages, partner proposals, brand assets, social content, or any visual deliverable. Triggers: 'lander revamp', 'brand guidelines', 'partnership deck', 'marketing page', 'social graphic', 'logo placement', 'brand colors', any work on curvance.com or partner-facing materials. Compose with Skill_AerariumUI.md for app-specific UI rules. Do NOT use for protocol app development, QA, or codebase work."
---

# Curvance Brand Identity

Rules for all brand and marketing work. Read before creating any visual deliverable, marketing page, or partner material.

## Brand Mission

Empower users to unlock the full potential of their digital assets through a decentralized, interoperable application. Simplify and enhance capital efficiency and reduce fragmentation throughout DeFi. Enable new users and experienced veterans alike to optimize yield and unlock liquidity in a seamless, trustless way.

### Tagline

**Current (2025):** "Click less, earn more"

## Two-Tier Identity System

Curvance operates two distinct visual identities. Never cross-pollinate without explicit discussion.

### Tier 1: Institutional

**Where:** `curvance.com` (lander), `app.curvance.com` (protocol), curator portal, partner proposals, docs, any external-facing professional material.

| Element | Treatment |
|---|---|
| Color | Dark palette with Majorelle Blue accent. No saturated game colors |
| Typography | Work Sans. Numbers-first, clean hierarchy. No playful fonts |
| Imagery | Abstract, data-driven. No characters, no illustrations, no mascot |
| Tone | Confident, precise, trust-forward |
| Animations | Purposeful state transitions only. No decorative motion |

### Tier 2: Engagement

**Where:** Bytes page, games (Floppy's Fortune, Bustabyte), social media, community content, achievement badges, share cards.

| Element | Treatment |
|---|---|
| Color | Saturated, vibrant. Purple-pink gradients, neon accents |
| Typography | Large bold multipliers, playful display text allowed |
| Imagery | Floppy mascot, retro cityscapes, illustrated scenes |
| Tone | Exciting, game-like, community-oriented |
| Animations | Expressive — celebration bursts, character motion, confetti |

### Shared Elements (both tiers)

- **Curvance logotype** (floppy disk icon + "Curvance" wordmark) — used in both contexts
- **Majorelle Blue (#644AEE)** — structural accent in Tier 1, CTA/highlight in Tier 2
- **Dark backgrounds** — both use dark surfaces as primary canvas

## Brand Colors

### Primary

| Color | Hex | Role |
|---|---|---|
| Majorelle Blue | `#644AEE` | Primary brand accent — highlights, interactions, structural elements |
| Lavender (Floral) | `#B896F1` | Secondary accent — sophistication, lighter companion to Majorelle Blue |

Both have full tint ramps in Reference → Brand Color Tint Ramps.

### Neutrals

| Color | Hex | Role |
|---|---|---|
| Night | `#121214` | Deep dark — near-black base for darkest surfaces |
| Eerie Black | `#181818` | Card/surface dark — maps to `bg-new-elements` in codebase |
| Davy's Gray | `#4F4F4F` | Mid-tone neutral — secondary UI elements |
| Platinum | `#D9D9D9` | Light neutral — borders, dividers on light surfaces |

### Extended

| Color | Hex | Role |
|---|---|---|
| Rich Black | `#06001A` | Foundation with slight purple tint — premium dark bg |
| Floral White | `#FAF9F0` | Warm white — light theme base (not stark #FFFFFF) |
| Gray | `#C8C6D2` | Subtle separation and depth |

**Color usage rules:** Majorelle Blue for highlighting and interactions. Lavender for secondary decorative elements. Rich Black / Night for foundations. Floral White for warmth on light layouts. Neutrals for layered depth.

**Data colors:** App uses semantic colors for market data — green (`#4ade80`) supply, burnt sienna (`#CC6B5A`) borrow, blue (`#60a5fa`) derived. Brand materials displaying metrics must use data colors, not brand purple. Full rules in `Skill_AerariumUI.md` → Color Palette.

**Version note:** v1 brand book established `#644AEE` as "Majorelle Blue." v2 renamed it "Iris Purple" and shifted to `#5740CE`. Canonical value is `#644AEE` per codebase and Chris confirmation.

## Logo

Stylized floppy disk — nostalgic symbol of digital storage blending retro aesthetics with contemporary design. Wordmark: sleek, modern, legible. Always mixed-case "Curvance" — never all-caps.

**Lockups:** Icon + wordmark horizontal (primary), standalone icon (secondary).

**Correct:** Original proportions, brand colors, proper contrast, clean layout. **Incorrect:** Cluttered bg, altered proportions/colors, rotation/distortion, gradients/shadows/outlines, all-caps. Approved backgrounds and full usage grid in Reference → Logo Usage Grid.

## Typography

| Typeface | Role | Where |
|---|---|---|
| **Monomials** | Brand/display — headings in marketing, brand statements, print. Also `font-mono` in-app | Lander, proposals, social headers. In-app: `font-mono` class |
| **Work Sans** | Primary UI + body — all app interface text, numbers, labels, inputs | App UI (`--font-sans` in Tailwind), brand communications |

**Codebase:** `Layout/logic/index.js` loads both. Work Sans via `next/font/google` as `--font-sans`. Monomials via `next/font/local` from `assets/fonts/monomials.otf` as `--mono`.

## Floppy Mascot

"Floppy" — 3D mascot inspired by the brand's floppy disk logo. Majorelle Blue and gray, expressive features, dynamic poses. Four art styles: 3D renders (badges, welcome screens), 2D stickers (social), 2D illustrated scenes (partnerships, social), game sprites (Bustabyte, promos). Full asset inventory in Reference → Floppy Asset Inventory.

**Tier enforcement:** Floppy appears ONLY on Tier 2 surfaces and the curator portal welcome page (personality touch). Never on protocol lander, market pages, dashboard, or institutional partner materials.

## Collaboration Proposals & Security Positioning

Template structure, existing partner proposals (Optimism, Reserve, Rocket Pool), and security messaging (Dual Oracle, Circuit Breaker, 20-minute cooldown, multi-audit strategy) in Reference → Collaboration Proposal Template and Security Messaging.

## Where I Go Wrong

| Trigger | Wrong | Right |
|---|---|---|
| Building any lander, marketing page, or partner material | Include Floppy mascot, game visuals, or playful elements | Tier 1 only — institutional, abstract, data-driven. No characters |
| Creating a social post, community graphic, or game asset | Use institutional style (clean, muted, numbers-first) | Tier 2 — use Floppy, vibrant illustrations, saturated colors |
| Placing the logo on a background | Place on any bg that seems fine | Check approved grid: clean light ✓, dark photo with contrast ✓, solid black ✓. Solid purple ✗, cluttered photo ✗ |
| Writing the brand name | "CURVANCE" in all-caps for emphasis | Always "Curvance" — mixed case. All-caps explicitly rejected |
| Using a warm white for light surfaces | Use `#FFFFFF` (pure white) | Use `#FAF9F0` (Floral White) |
| Using pure black for dark surfaces | Use `#000000` | Use `#121214` (Night) or `#06001A` (Rich Black) |
| Referencing "brand purple" | Use `#5740CE` from v2 brand book | Canonical is `#644AEE` (Majorelle Blue) — v1 brand book + codebase + Chris |
| Building the curator portal splash page | Strict institutional style, no personality | Floppy at desk is the one approved exception |
| Choosing a typeface for display headings on marketing | Default to Work Sans for everything | Monomials is brand display for lander, proposals, social headers. Work Sans for body and app UI |
| Forgetting the secondary purple | Only use Majorelle Blue everywhere | Lavender (`#B896F1`) exists as secondary accent |

## References

**File:** `Reference_CurvanceBrand.md` (180 lines)

| Section | Lines | Description |
|---|---|---|
| Logo Usage Grid | 7-26 | 9 approved/rejected placement examples with rationale |
| Brand Color Tint Ramps | 27-50 | Majorelle Blue and Lavender full gradient scales (12 steps each) |
| Brand Color Pairings | 51-64 | Wordmark on 5 background combinations |
| Floppy Asset Inventory | 65-106 | 3D poses (4), sticker moods (4), illustrated scenes, game sprites |
| Collaboration Proposal Template | 107-134 | Cover layout spec, document page structure, existing partner proposals |
| Security Messaging | 135-154 | Full security narrative — risks, mitigations, audit partners |
| Brand Book Metadata | 155-180 | Both v1 and v2 version info, page indices, discrepancy notes |

**Cross-references:**

| Topic | File |
|---|---|
| App UI conventions, dark theme tokens | Skill_AerariumUI.md |
| App color token hex values | Reference_AerariumUI.md → Color Tokens |
| Bytes page, games, engagement features | Skill_CurvanceBytes.md |
