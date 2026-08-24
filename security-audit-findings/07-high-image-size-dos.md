# Metro image parser dependency contained zero-length loops

```yaml
severity: HIGH
vulnSlug: vulnerable-dependency
title: Metro image parser dependency contained zero-length loops
confidence: high
triage:
  priority: P1
  exploitability: difficult
  impact: medium
  reasoning: image-size is used only by Metro during trusted builds, but malformed checked-in ICNS or JXL assets could permanently block a build worker.
revalidation:
  verdict: true-positive
  reasoning: image-size 1.2.1 could fail to advance its ICNS entry loop and JXL partial-stream loop for a zero or undersized entry.
```

## Description

`bun audit` reported GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq against `image-size@1.2.1`, which Metro brings into the mobile build toolchain. GitHub lists no patched release, and the upstream repository was archived in June 2026.

## Recommendation

Keep the transitive dependency pinned and apply a reproducible package patch that rejects entries shorter than their format header. Remove the patch when Expo or Metro stops depending on the affected package.

## Resolution

`patches/image-size@1.2.1.patch` rejects ICNS entries shorter than 8 bytes and JXL partial-stream boxes shorter than 12 bytes before either loop can reuse its current offset. Bun records the patch under `patchedDependencies` in `package.json` and `bun.lock`.

Regression coverage: `tests/image-size-security-contract.test.ts`. The test inspects the installed parser guards without running a malicious file or proof-of-concept payload.

Advisories:

- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
