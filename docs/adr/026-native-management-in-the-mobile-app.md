# 026. Native management in the mobile app

**Status:** Accepted
**Date:** 2026-10-08

> Amends [ADR-001](001-monorepo-split.md), and [ADR-006](006-five-languages-rtl.md) for staff
> screens only. The web admin stays. The mobile app also gains native
> management screens for every role.

## Context

ADR-001 put staff and entity management in a web app, because React Native Web renders data tables,
sidebars and charts poorly. That reasoning still holds for rendering desktop layouts. It does not
answer a different need: staff work on the go, and Ramassà wants every dashboard task available on a
phone and a tablet with a good mobile experience. The app is also a candidate white-label product
for other NGOs.

Since ADR-001, the code has settled in a way that makes a second client cheap at the logic level.
Every admin area has its data module in `packages/shared`, authorization is in PostgreSQL RLS
(ADR-009), and the web admin has a single server function.

## Decision

1. The one mobile app serves every account type. After sign-in the account type (player, team member,
   entity) and, for team members, their permissions pick the experience. An unknown account type
   gets a no-access screen.
2. Management screens are native React Native screens designed for touch, for phone and tablet. They
   call the shared modules and rely on the same RLS rules. Desktop patterns are redesigned for mobile:
   card lists in place of tables, one figure per card with full charts on tap, a native block editor
   on structured content.
3. Fine-grained permissions replace the fixed staff and admin roles. A fixed catalog of small
   permissions is enforced in RLS through `has_permission`. Admins apply built-in presets (Coach,
   Staff, Admin) or their own organization presets, then toggle single permissions per person.
   Seeing encrypted personal fields is its own permission. An organization always keeps one person
   who can manage the team, and nobody can grant a permission they do not hold.
4. A second factor (TOTP, Supabase MFA) is required for every team member and entity account. Management
   RLS requires `aal2`. The web admin ships the same enrolment in the same release.
5. Remote sign-out uses a per-profile "sessions valid after" time checked by the database role
   helpers, following the immediate-deny pattern of ADR-025.
6. Decrypted personal data is never written to the persisted query cache.
7. The staff side (web dashboard, team member and entity screens) uses Catalan, Spanish and English.
   Players keep the five languages of ADR-006, and player content is still written in all five.
8. The web admin keeps full parity and remains the place for desktop work.

## Alternatives Considered

- **Expo DOM components embedding the web admin.** Fast to start, but the screens behave like a
  website (small targets, no native gestures, weak offline). Kept only as a fallback for a single
  piece that proves very hard to build natively.
- **A WebView of a responsive web admin.** Cheapest, but it gives the desktop experience on a phone
  and a second sign-in.
- **A separate staff app.** Smaller apps, but two builds, two store listings and two releases for
  every change, and a weaker single white-label package.
- **Three fixed levels (coach, staff, admin).** Simpler, and it was the first draft of this ADR on
  the same day. Rejected because an organization must be able to give one person one job only
  (for example creating accounts or managing stock), and the white-label product needs that.

## Consequences

- Each management screen exists twice (web and native). The logic and the rules exist once.
- Every database change to a management area must be checked against both clients. The permission
  matrix test covers both.
- Every RLS policy that checks the staff or admin role moves to `has_permission`. This is a large,
  careful migration in phase 1.
- The staff side drops Arabic and Farsi, which partly amends ADR-006 for staff screens only.
- The mobile app grows in size and in QA surface: phone and tablet, five languages, RTL, offline.
- TOTP enforcement in RLS means the web admin and the app must ship the second factor together.
- Design: `docs/plans/2026-10-08-native-management-app-design.md`.
