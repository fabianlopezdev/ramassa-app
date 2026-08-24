# Capture server allowed encoded path traversal

```yaml
severity: HIGH
vulnSlug: path-traversal
title: Capture server allowed encoded path traversal
lineNumbers: [110, 119, 123, 124, 168, 169]
confidence: high
triage:
  priority: P1
  exploitability: moderate
  impact: high
  reasoning: A crafted local request could escape the exported web root and read any file accessible to the process.
revalidation:
  verdict: true-positive
  reasoning: The former server joined the request pathname to the export directory without decoding and containment validation.
```

## Description

The local capture server used the URL pathname as a filesystem path. Encoded traversal segments could resolve outside the web export directory and expose files through the server.

## Recommendation

Decode once, reject malformed encodings, resolve against the export root, and reject empty, parent, or absolute relative paths. Bind the utility server to loopback only.

## Resolution

`scripts/flow-capture/servers.ts` now uses `resolveWebExportAssetPath` to decode and enforce root containment. The server binds to `127.0.0.1`.

Regression coverage: `scripts/flow-capture/servers.test.ts`.
