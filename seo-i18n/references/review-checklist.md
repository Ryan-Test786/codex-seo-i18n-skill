# Review Checklist

Run this checklist for each output file.

## File Integrity

- UTF-8 encoding
- Non-empty file
- Valid JSON parse
- No malformed punctuation artifacts

## Structure Integrity

- Expected JSON keys exist
- No missing required sections
- URL/path fields preserved from source (`href`, `path`, `image_url`, etc.)
- No translated route/resource path

## Language Quality

- Grammar is natural and readable
- No ambiguity or unclear phrasing
- Terminology is consistent across sections
- Locale style is appropriate (`zh`, `en`, `zh-hant`, and others)

## SEO Quality

- Required keyword appears in high-priority positions
- Keyword density is within target range
- No keyword stuffing
- Page intent and scenario intent remain aligned

Keyword density formula:

```text
(keyword_occurrences * keyword_length) / text_length * 100%
```

## Safety and Compliance

- Prohibited terms are absent
- Claims are realistic and non-deceptive
- No policy-risk language injected by translation

## Delivery Rules

- First sample set approved by user before full rollout
- Every batch run followed by count + anomaly audit
- Any anomaly repaired and re-audited before completion
