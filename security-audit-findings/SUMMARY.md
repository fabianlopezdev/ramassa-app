# RAPP-67 deepsec findings

Scan ID: `20260824112457-743d1f3c4f9f427d`

The genuine deepsec 2.0.12 engine scanned the full repository after remediation. It evaluated 522 TypeScript files, 10 JavaScript files, 2 Kotlin files, and 1 Python file. The engine returned 590 candidates in 290 files. Two investigation waves and an independent skeptical revalidation reduced that candidate set to five true positives. Required closure reviews then found one Sentry PII boundary defect and one vulnerable dependency with two HIGH advisories. All seven finding records are fixed with regression tests. No finding is risk-accepted or unresolved.

| Finding                                                          | Severity | Priority | Confidence | Resolution                                                                |
| ---------------------------------------------------------------- | -------- | -------- | ---------- | ------------------------------------------------------------------------- |
| Custom-scheme auth callback exposed bearer sessions              | HIGH     | P1       | high       | Replaced with email-bound OTP verification and PKCE                       |
| Deployment secrets were available to the whole job               | HIGH     | P1       | high       | Secrets are step-scoped and the GitHub environment is explicit            |
| Capture server allowed encoded path traversal                    | HIGH     | P1       | high       | Decoded paths are contained inside the export root and bind to loopback   |
| Automatic deploy could build a different commit than CI verified | MEDIUM   | P1       | high       | Checkout is pinned to `workflow_run.head_sha`                             |
| RGPD request audit fields trusted caller-controlled values       | MEDIUM   | P1       | high       | Direct updates are revoked and a tenant-scoped RPC derives actor and time |
| Nested Sentry error context bypassed the shared redactor         | HIGH     | P1       | high       | All runtime adapters use one shared redacted report-extra boundary        |
| Metro image parser dependency contained zero-length loops        | HIGH     | P1       | high       | Reproducible Bun patch rejects undersized ICNS and JXL entries            |

## Verification

- Focused auth and RGPD tests: 34 passed.
- RGPD pgTAP security test: 11 passed, including 51 of 51 public tables with RLS and explicit policies.
- Full repository tests: 1,203 passed, 1 expected wrapper skip, 0 failed.
- Full database suite inside the repository run: 1,215 assertions passed.
- Type checks: all workspaces passed.
- Lint: passed.
- Admin production build: passed and regenerated the route tree without the deleted callback route.
- Mutation proof: changing PKCE back to implicit made the auth security contract fail.
- Mutation proof: granting direct update access made the RGPD audit-field test fail.
- Earlier mutation proof: restoring the deploy ref mismatch and traversal weakness made their focused contracts fail.
- Sentry mutation proof: restoring unredacted nested error context made the PII contract fail.
- Dependency patch contract: installed ICNS and JXL parser guards are verified without running a malicious payload.

## Supporting records

- `INVENTORIES.md`
- `MASVS-CHECKLIST.md`
- `BACKUP-RESTORE-RUNBOOK.md`
