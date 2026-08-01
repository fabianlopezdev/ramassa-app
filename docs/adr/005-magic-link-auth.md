# 005. Magic link auth + password fallback

**Status:** Accepted
**Date:** 2026-04-09

## Context

Players have varying digital literacy. Some may not have email addresses. The project owner explicitly wants zero messaging costs for auth.

## Decision

- **Primary:** Magic link via email (Supabase Auth `signInWithOtp`). Free, no SMS costs.
- **Fallback:** Admin-created accounts with an internal address (`firstname.<id>@ramassa.invalid`) + password. For players without personal email. Credentials shared in person by staff.

> **Amended 2026-08-01 (RAPP-25).** The address was originally specced as
> `@ramassa.app`. It is a LOGIN IDENTIFIER, never a mailbox: the woman it
> belongs to has no email, which is the whole reason the account exists. A real
> domain would mean any automatic mail Supabase sends (recovery, email change, a
> resend added in a later phase) could one day be delivered to whoever holds
> that mailbox — a password link for a participant's account, to a stranger —
> and could collide with a real address created on that domain later. `.invalid`
> is reserved by RFC 2606 so it can never resolve, anywhere, ever. The format is
> otherwise unchanged, and the address is GENERATED server-side, so staff never
> type a domain and cannot get it wrong.

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
- Admin needs a "create user" screen. **Superseded by ADR-022 (2026-08-01):** it
  runs as a SECURITY DEFINER Postgres function, not an Edge Function, so no
  service-role key exists in this system at all.
