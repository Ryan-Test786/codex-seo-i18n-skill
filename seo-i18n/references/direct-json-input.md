# Direct JSON Translation Input

Use this input contract for Mode A (Direct JSON Translation).

## Required

- One JSON object (inline or file path)
- Source language code (for example: `en`, `zh`, `zh-hant`)
- Target language codes (comma-separated list)

## Optional

- Output code/stem for file naming
- Extra invariant keys that must never be translated
- Glossary and prohibited-term list

## File Naming Convention

Normalize source file as:

```text
<code>-<source_lang>.json
```

Generated outputs:

```text
<code>-<target_lang>.json
```

## Invariant Field Guidance

Do not translate values for keys such as:

- `keyword`
- `route`
- `path`
- `href`
- `image_url`

Also keep URL/path/resource-like string values unchanged.
