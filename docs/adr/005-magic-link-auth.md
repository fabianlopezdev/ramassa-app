# 005. Magic link auth + password fallback

**Status:** Accepted
**Date:** 2026-04-09

## Context

Players have varying digital literacy. Some may not have email addresses. The project owner explicitly wants zero messaging costs for auth.

## Decision

- **Primary:** Magic link via email (Supabase Auth `signInWithOtp`). Free, no SMS costs.
- **Fallback:** Admin-created accounts with internal email (`firstname.id@ramassa.app`) + password. For players without personal email. Credentials shared in person by staff.

## Alternatives Considered

- **SMS OTP** — rejected. $15-20/month for ~50 users. Ongoing cost with no benefit over email magic links.
- **WhatsApp auth** — rejected. API costs, dependency on Meta platform.
- **Passkeys** — rejected. Too new, inconsistent support on low-end Android devices.
- **PIN-based** — rejected. No standard implementation in Supabase, custom auth layer needed.
- **Password-only** — rejected. Requires all users to remember passwords, poor UX for low-literacy users.

## Consequences

- Zero auth cost (Supabase email sending is included)
- Magic links work across all platforms (mobile deep link, web redirect)
- Fallback requires admin to create accounts manually and share credentials in person
- Admin needs a "create user" screen with Edge Function (service role key)
