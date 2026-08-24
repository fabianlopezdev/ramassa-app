# RAPP-67 security inventories

Verified against the reset local database after migration `20260824030000_secure_deletion_request_transitions.sql`.

## RLS inventory

- Public tables: 51.
- Tables with RLS enabled: 51.
- Tables without RLS: 0.
- Tables without an explicit policy: 0.
- Internal-only tables use explicit deny-all policies instead of relying on the absence of a policy: `mentoring_notification_events`, `municipality_catalog`, `push_deliveries`, and `push_publications`.
- The strict inventory and RGPD transition contract is enforced by `supabase/tests/0039_deletion_request_security_test.sql` with 11 assertions.

## Encrypted-field inventory

Every ADR-004 profile field is stored as `bytea` and accessed through server-side encryption helpers:

| Table                  | Encrypted columns                                    |
| ---------------------- | ---------------------------------------------------- |
| `profiles`             | `address`, `document_number`, `phone`, `postal_code` |
| `entity_referrals`     | `notes`, `referred_email`, `referred_phone`          |
| `feedback_submissions` | `content_encrypted`                                  |
| `mentoring_requests`   | `staff_notes_encrypted`, `topic_detail_encrypted`    |
| `referral_updates`     | `content`                                            |
| `survey_responses`     | `answers_encrypted`                                  |

Total encrypted public columns: 12. The production key must remain in the Ramassa-owned Supabase Vault under `app_encryption_key` and must never enter the repository, vault notes, logs, or deployment output.

## Supabase Auth review

- Email login uses a six-digit email-bound OTP. Bearer sessions do not travel through custom-scheme URLs.
- The Supabase client uses PKCE and does not detect a session from a URL.
- Custom-scheme auth callback routes and redirect allowlist entries were removed.
- JWT lifetime is 3,600 seconds, refresh token rotation is enabled, and the reuse interval is 10 seconds.
- OTP length is 6 and local expiry is 3,600 seconds.
- Local rate limits are 2 auth emails per hour and 30 token verifications per 5 minutes per IP.
- Anonymous sign-in and manual identity linking are disabled.
- Login calls set `shouldCreateUser: false`. Account provisioning remains a database-controlled staff or invitation workflow.
- Production session time-boxing, inactivity timeout, and single-session policy remain a RAPP-74 production configuration gate.

## Worker and R2 authorization review

- Media and translation Workers verify the Supabase JWT signature through JWKS with issuer and `authenticated` audience checks.
- Tenant and role come from the caller's RLS-filtered profile, not from caller-controlled request data.
- Media reads require a bearer token and database authorization before a private R2 object is read.
- Upload keys are server-generated, folder roles are enforced, rate limits are user and organization scoped, and signed uploads bind content type and length.
- Cross-organization reads, deletes, and participant media purges are denied without revealing whether an object exists.
- Focused safe tests passed for unauthenticated requests, role denial, cross-tenant denial, private object reads, upload minting, item deletion, participant purge, and staff-only translation.

## Repository history secrets review

- Full-history scan findings: 11.
- Revalidated categories: public Supabase publishable key, Firebase client API key, and logger test fixtures.
- Private credentials found: 0.
- No service-role key exists in this architecture.
- No unredacted secret report was retained.

## Sentry and log PII review

- `sendDefaultPii` is false for mobile, admin, media Worker, and translation Worker.
- Session replay is not enabled.
- Shared redaction covers names, contact details, addresses, document identifiers, credentials, tokens, mentoring topics, support detail, and free-text email, phone, DNI, and NIE patterns.
- The closure review found and fixed the nested `AppError.context` bypass described in `06-high-sentry-context-pii.md`.
- Local logger, redactor, Sentry-extra, and Worker denial tests passed.
- Sampling real production events remains blocked because production Sentry is still developer-owned and no Sentry access token is available in this environment. This is sequenced through RAPP-83.

## Infrastructure ownership reconciliation

The live vault records confirm that production infrastructure is not provisioned yet:

- RAPP-74 is Todo. There is no Ramassa-owned Supabase Pro project, production Vault key, production backup set, or client-controlled recovery access.
- RAPP-83 is Backlog. EAS, Cloudflare preview resources, Sentry, and the GitHub repository still require final client ownership, billing, recovery, credential rotation, and witnessed access.
- Production data must not be introduced until RAPP-74 and the applicable RAPP-83 ownership rows are complete.
