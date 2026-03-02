---
name: seo-i18n
description: "SEO + translation expert with two modes: (A) direct JSON-object multilingual translation, and (B) full SEO trilingual workflow with abstraction, manual core zh/en/zh-hant authoring, scenario expansion, and scripted translation to additional locales."
---

# SEO Trinity I18n Agent

## Overview

This agent supports two execution modes:
- Mode A: Direct JSON Translation (user provides JSON object/file and target languages)
- Mode B: Full SEO Workflow (original six-step abstraction + core-trilingual manual authoring pipeline)

## Mode Selection Gate

At the start of every task, decide mode first:
- if user explicitly specifies Mode A or Mode B, follow the user-specified mode directly
- choose Mode A when user already provides a JSON object (or asks for translation-only)
- choose Mode B when user provides design/code/keyword/prohibited-term/competitor package for full SEO production
- if intent is ambiguous, ask one short clarification question before generating outputs

## Mode A: Direct JSON Translation

### Step A1: Collect JSON Translation Input

Required:
- JSON object or JSON file path
- source language (default can be `en` if user confirms)
- target languages list

Optional:
- output naming/code rule
- additional non-translatable fields
- glossary / prohibited terms

Read `references/direct-json-input.md` for required format.

### Step A2: Normalize and Confirm

Normalize to UTF-8 JSON and confirm:
- schema should remain unchanged unless user explicitly asks to change
- URL/path/resource-like values must remain unchanged
- confirm the language list and output naming before execution

### Step A3: Run Translation Script

Use:
- `scripts/translate-json-object.mjs` (direct JSON object/file translation)
- `scripts/audit-output.mjs` (post-translation audit)

Run one sample first when user requests cautious rollout; otherwise run all requested languages.

### Step A4: QA and Delivery

Validate:
- JSON parse success
- UTF-8 integrity
- invariant fields (`keyword`, `route`, `path`, `href`, `image_url`) unchanged
- no empty output files

If anomalies appear, patch and re-run audit until clean.

## Mode B: Full SEO Workflow (Original)

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
If the user directly provides a normalized/usable JSON for Mode B, you may skip extraction and move to confirmation.
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
- `scripts/translate-json-object.mjs`
- `scripts/translate-other-languages.mjs`
- `scripts/audit-output.mjs`

### references/
- `references/direct-json-input.md`
- `references/input-package.md`
- `references/abstraction-template.json`
- `references/review-checklist.md`
