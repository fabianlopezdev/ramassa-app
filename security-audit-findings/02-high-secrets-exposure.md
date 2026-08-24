# Deployment secrets were available to the whole job

```yaml
severity: HIGH
vulnSlug: secrets-exposure
title: Deployment secrets were available to the whole job
lineNumbers: [46, 64, 71, 79, 85]
confidence: high
triage:
  priority: P1
  exploitability: difficult
  impact: high
  reasoning: Any compromised build or install step in the deployment job could read deployment credentials it did not need.
revalidation:
  verdict: true-positive
  reasoning: Cloudflare and Sentry credentials were previously exposed at job scope across dependency installation and both builds.
```

## Description

The deployment workflow exposed Cloudflare and Sentry credentials to the full job. This widened the credential trust boundary to steps that only needed dependencies or public build configuration.

## Recommendation

Declare protected GitHub environments and scope each credential to the smallest step that consumes it.

## Resolution

`.github/workflows/deploy.yml` now declares its GitHub environment explicitly. Sentry is available only to the admin build, while Cloudflare credentials are available only to deploy steps. All external actions are pinned to immutable commit SHAs.

Regression coverage: `tests/deploy-security-contract.test.ts`.
