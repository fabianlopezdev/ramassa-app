# Supabase backup restore drill runbook

This runbook is ready, but the production drill has not been executed. RAPP-74 confirms that no Ramassa-owned production Supabase project exists yet, so there is no production backup that can be restored and no client-owned scratch organization in which to perform the drill.

Official references:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/duplicate-project
- https://supabase.com/docs/guides/deployment/going-into-prod

## Preconditions

1. RAPP-74 is complete: Ramassa owns the EU Frankfurt Pro project, billing, Vault key recovery, and at least two recoverable administrators where supported.
2. A recent daily backup is visible. Supabase documents daily backups for Pro projects and a seven-day retention window.
3. The restore target is a new Ramassa-owned scratch project in the same EU region with no public application traffic.
4. A maintenance record identifies the selected backup timestamp, operators, expected row counts, and deletion deadline without recording credentials or participant values.
5. The operator understands that database backups do not include R2 or Supabase Storage object bytes. Object recovery must be verified separately for the private R2 bucket.

## Drill

1. Record production schema version, migration count, public table count, organization count, and row counts for a small approved set of non-sensitive tables.
2. Use Supabase's supported restore-to-new-project or duplicate-project workflow to create the scratch restore. Do not restore over production.
3. Keep all scratch API keys out of the repository and vault. Install them only in a temporary local operator environment.
4. Recreate the scratch `app_encryption_key` through the approved recovery procedure. Never print or paste its value into evidence.
5. Confirm all migrations and required extensions are present.
6. Run the RLS inventory queries. Require 51 of 51 public tables with RLS and zero tables without an explicit policy, adjusted only for later committed migrations.
7. Verify the encrypted-field inventory and confirm approved sample rows decrypt only through the intended RPCs.
8. Run the full pgTAP suite against scratch.
9. Verify Auth users, profiles, organizations, audit rows, and deletion-request lifecycle counts against the pre-drill record.
10. Verify unauthorized and cross-tenant reads remain denied using safe test accounts. Do not send exploit payloads.
11. Record start time, completion time, validation result, recovery point, and any manual step needed.
12. Destroy the scratch project by the recorded deadline and verify its credentials are revoked.

## Success criteria

- Restore completes in the expected region and client-owned organization.
- Schema, RLS, encrypted fields, Auth relationships, and selected row counts match the source recovery point.
- Full pgTAP passes.
- No cross-tenant or unauthenticated access succeeds.
- R2 recovery is separately accounted for because database backups exclude object bytes.
- Scratch is removed and all temporary credentials are revoked.

## Current blocker

The drill cannot truthfully pass until RAPP-74 provisions production and RAPP-83 provides client-owned recovery access. This is an external infrastructure prerequisite, not a code failure.
