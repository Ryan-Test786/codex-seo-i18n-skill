---
name: seo-i18n
description: "Build SEO-ready JSON copy and multilingual locale files for scenario pages. Use when a user provides a source folder (designs/code, keywords, prohibited terms, competitor notes, or handwritten requirements) and needs: (1) structured content abstraction, (2) manual zh/en/zh-hant copy authoring with review loops, (3) multi-scenario expansion, and (4) API-based translation from English to additional languages while preserving URLs and UTF-8 integrity."
---

# SEO Trinity I18n Agent

## Overview

Implement a six-step workflow for SEO content production:
extract structure -> confirm -> manually author core trilingual files -> expand scenarios -> manually author all trilingual variants -> script-translate from English to other locales with full QA.

## Workflow

### Step 1: Collect Input Package

Require the user to place all source materials in one directory and provide that directory path.
Accept any mix of:
- design references or code files
- keyword datasets
- prohibited-term lists
- competitor references
- handwritten requirement notes in `.md`

Read `references/input-package.md` for required and optional inputs.

### Step 2: Abstract Content to JSON and Confirm

Extract page copy blocks and image resources from design/code into a normalized JSON file.
Use `references/abstraction-template.json` as the baseline shape.
Do not continue until the user confirms the abstraction is correct.
If the user requests changes, update the abstraction and re-confirm.

### Step 3: Produce Core zh/en/zh-hant SEO Files (Manual Authoring Only)

Generate one scenario's three core files first:
- Simplified Chinese (`-zh`)
- English (`-en`)
- Traditional Chinese (`-zh-hant`)

Hard rules:
- author manually, one file at a time
- do not use batch generation tools for core trilingual files
- do not directly machine-translate for core trilingual files
- never translate URLs or resource paths
- always use UTF-8 for read/write

Run self-review before user review. Use `references/review-checklist.md`.
Loop until user confirms this first set.

### Step 4: Confirm Scenario Matrix

Expand to multiple scenario sets (for example: region, account type, game type, business model).
Agent can suggest additional scenario dimensions, but user confirmation is mandatory before generation.
Record approved scenario matrix before moving to Step 5.

### Step 5: Produce All Core Trilingual SEO Files

For each approved scenario, generate `-zh`, `-en`, `-zh-hant` manually and review each file.
Do not switch to batch generation for these three core languages.
Maintain one-by-one authoring and review discipline.

For every file, validate:
- valid JSON structure
- UTF-8 encoding
- URL/path unchanged and reachable format preserved
- grammar and fluency
- no ambiguity
- keyword coverage and density compliance
- prohibited-term avoidance
- SEO consistency

### Step 6: Generate Other Languages from English via Script + API

After core trilingual files are approved:
1. generate Node.js translation script from JSON structure
2. ensure script never translates URL/path fields
3. run one complete sample scenario first for all requested target languages
4. request user confirmation
5. run remaining scenarios in batch

Use:
- `scripts/translate-other-languages.mjs`
- `scripts/audit-output.mjs`
- `config.json` for `TENCENT_SECRET_ID` and `TENCENT_SECRET_KEY`

Post-run checks:
- expected file counts by scenario/language
- empty file detection
- UTF-8 decode and JSON parse checks
- URL/path integrity checks against `-en` source

If anomalies are found, report to user, patch, and re-run audit until no issue remains.

## Operating Rules

- read and write all files in UTF-8
- keep URL/path values unchanged across languages
- keep JSON schema stable unless user approves schema changes
- do not skip user confirmation gates
- do not replace manual core-trilingual authoring with batch shortcuts
- run QA after every file or batch stage depending on workflow step

## Resources (optional)

### scripts/
- `scripts/translate-other-languages.mjs`
- `scripts/audit-output.mjs`

### references/
- `references/input-package.md`
- `references/abstraction-template.json`
- `references/review-checklist.md`
