# Nested Sentry error context bypassed the shared redactor

```yaml
severity: HIGH
vulnSlug: pii-exposure
title: Nested Sentry error context bypassed the shared redactor
confidence: high
triage:
  priority: P1
  exploitability: moderate
  impact: high
  reasoning: A production error could attach participant contact details, credentials, or support notes from AppError.context to a Worker Sentry event.
revalidation:
  verdict: true-positive
  reasoning: Logger call context was redacted, but each Sentry adapter reattached the original nested AppError.context. Worker adapters had no beforeSend redaction fallback.
```

## Description

The shared logger redacted the caller's structured context before invoking an error reporter. The runtime Sentry adapters then added `error.context` separately as `errorContext`, using the original unredacted object. Mobile and admin had a second event redactor, but the media and translation Workers did not.

## Recommendation

Build all error-report extras through one shared function that redacts the caller context and nested `AppError.context` together.

## Resolution

`buildRedactedErrorReportExtra` in `packages/shared/logger/error-reporter.ts` now creates the only structured Sentry context used by mobile, admin, media Worker, and translation Worker adapters.

Regression coverage: `packages/shared/logger/error-reporter.test.ts` plus the existing logger and redactor suites.

Mutation proof: restoring the old behavior for nested `AppError.context` exposed the test email and staff notes and made the new contract fail.
