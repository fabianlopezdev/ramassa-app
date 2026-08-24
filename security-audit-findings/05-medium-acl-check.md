# RGPD request audit fields trusted caller-controlled values

```yaml
severity: MEDIUM
vulnSlug: acl-check
title: RGPD request audit fields trusted caller-controlled values
lineNumbers: [3, 4, 6, 17, 20, 24, 42, 45, 46, 167]
confidence: high
triage:
  priority: P1
  exploitability: moderate
  impact: medium
  reasoning: Same-tenant staff could forge the resolver, resolution time, state, and participant reason through the table API.
revalidation:
  verdict: true-positive
  reasoning: RLS checked organization membership but allowed arbitrary update payloads, and the client helper supplied audit identity and time.
```

## Description

The deletion request update policy authorized same-tenant staff to update the row but did not constrain which columns could change. A caller could rewrite the participant's reason, claim another resolver identity, forge the resolution time, or skip lifecycle states.

## Recommendation

Revoke direct updates and expose one security-definer transition function that derives the actor from `auth.uid()`, derives time from `now()`, locks the row, validates the state transition, and constrains the request to the caller's organization.

## Resolution

`supabase/migrations/20260824030000_secure_deletion_request_transitions.sql` removes the update policy, revokes table updates, and adds `transition_deletion_request`. `packages/shared/rgpd/rgpd-actions.ts` calls the RPC without accepting a resolver ID or timestamp from the client.

Regression coverage: `supabase/tests/0039_deletion_request_security_test.sql` and `packages/shared/rgpd/rgpd-actions.test.ts`.
