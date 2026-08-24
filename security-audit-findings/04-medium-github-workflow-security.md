# Automatic deploy could build a different commit than CI verified

```yaml
severity: MEDIUM
vulnSlug: other-github-workflow-security
title: Automatic deploy could build a different commit than CI verified
lineNumbers: [20, 22, 41, 52, 54]
confidence: high
triage:
  priority: P1
  exploitability: moderate
  impact: medium
  reasoning: A later main commit could be deployed under the successful status of an earlier workflow run.
revalidation:
  verdict: true-positive
  reasoning: The workflow_run job used the deployment workflow revision instead of the exact head SHA carried by the successful CI event.
```

## Description

The automatic deployment was triggered by a successful CI workflow but did not check out the exact commit that produced that success. A newer commit on main could therefore be built and deployed without having passed that CI run.

## Recommendation

For `workflow_run`, check out `github.event.workflow_run.head_sha`. Retain `github.sha` only for a deliberate manual dispatch.

## Resolution

`.github/workflows/deploy.yml` selects the verified workflow-run SHA for automatic deployments. The workflow test asserts the exact expression.

Regression coverage: `tests/deploy-security-contract.test.ts`.
