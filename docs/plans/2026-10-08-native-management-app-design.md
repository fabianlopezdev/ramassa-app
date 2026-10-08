# Native management in the mobile app: design

**Date:** 2026-10-08
**Status:** Approved by Fabián (design review, 2026-10-08)
**Decision record:** [ADR-026](../adr/026-native-management-in-the-mobile-app.md)

## Why

Staff are often away from a desk: at the pitch, at an onboarding session, on the train. Today the
mobile app gives staff two tools only, attendance and messages
(`apps/mobile/src/app/(app)/_layout.tsx`). Every other task needs the web admin, which was built for
a desktop. Marc asked which dashboard tasks staff can do from a phone. The answer was "almost none",
and that is the gap this design closes.

The app is also the product that can be offered to other NGOs as a white label. A management
experience that works well on a phone and a tablet makes that product much stronger.

## Goal

Every role can do its full job from the one Ramassà app, on phone and tablet. The app uses the same
Supabase backend and the same `packages/shared` data code as the web admin. The web admin stays and
keeps full parity.

## What makes this affordable

- Every dashboard area already has its data module in `packages/shared` (participants, events,
  announcements, knowledge, services, forum, surveys, mentoring, referrals, analytics, data exports,
  organization settings, RGPD and more).
- Authorization is in PostgreSQL row-level security (ADR-009), so a native screen gets the same rules
  as the web page.
- The web admin has one server function only (`apps/admin/src/lib/request-language.ts`).

So the new work is screens. The logic and the rules are reused.

## Approach

Native React Native screens in `apps/mobile`, built for touch, for phone and for tablet, calling the
shared modules through TanStack Query.

Rejected: Expo DOM components that embed the web admin's components (fast to start, but they feel
like a website, with small targets, no native gestures and weak offline use), and a WebView of the
web admin (cheapest, but it gives the desktop experience on a phone). A DOM component remains an
allowed fallback for one piece that proves very hard to build natively. None is known today: content
is structured blocks (`packages/shared/structured-content`), which suits a native block editor.

## Roles

| Role               | Experience in the app                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| player             | The five player tabs, unchanged.                                                                                                                              |
| coach (new)        | Attendance, events, messages, material handovers. Sees name, photo and sizes. Never sees the encrypted fields (address, postal code, phone, document number). |
| staff              | Everything except Data and Settings.                                                                                                                          |
| admin              | Everything.                                                                                                                                                   |
| entity             | The entity portal: Home, Referrals, Services, Events, Messages.                                                                                               |
| unknown or missing | A plain "no access" screen. Never the player tabs.                                                                                                            |

The coach level is enforced in the database, so it applies on the web admin as well. Admins assign
levels in Settings.

## Navigation

- **Player:** five tabs, as today.
- **Entity:** Home (impact on the women they referred), Referrals, Services, Events, Messages. This
  matches `ENTITY_NAV_ITEMS` in `apps/admin/src/lib/nav-items.ts`.
- **Staff and admin (phone):** five tabs.
  - **Today:** actions that need doing now. Today's sessions with one tap to take attendance, unread
    messages, services waiting for review, forum reports, mentoring requests, deletion requests.
  - **Participants:** search, filters, profile card, notes, material handovers, invites.
  - **Content:** announcements, events, knowledge base, services, review queue.
  - **Messages.**
  - **More:** impact dashboard, forum moderation, mentoring, feedback, notifications, surveys, player
    preview, my security settings. Admins also see Data and Settings.
- **Coach (phone):** Today (sessions and messages only), Events, Messages, More (handovers, security).
- **Tablet (all management roles):** a sidebar with every area and list-and-detail split views.

## Screen patterns

- **Data tables** become card lists: two or three key fields per card, search on top, filter chips,
  full filters in a bottom sheet, swipe actions for common tasks. On tablet the same screen shows a
  table with a fixed header.
- **Charts** show one figure per card with a small trend line. A tap opens the full chart on its own
  screen, with a period control (week, month, season). Bars replace pies. Every chart has a text and
  table alternative for screen readers.
- **Content editing** uses a block editor: one block at a time, drag to reorder, language tabs
  (CA, ES, EN, AR, FA) with the translation status of each, auto-translation suggestions to accept or
  edit, and "Preview as player" per language. Drafts save on the device.
- **Forms** are one column, with steps for long forms, native pickers for every field with fixed
  values, a save button that stays in view, and a warning before leaving with unsaved changes.
- **Exports and reports** need a step-up check, then open in the system share sheet. The audit log
  records every export.
- **Offline:** every list shows the last loaded data with the existing offline notice. Field tasks
  (attendance, handovers, quick notes) save offline and sync later. Other changes need a connection,
  and the app says so before the user starts.
- **House rules stay:** 56dp touch targets, icons with labels, full RTL, five languages, no technical
  error messages, WCAG AA.

## Authentication and authorization

- **Players:** email code as today, plus an optional app lock.
- **Second factor (TOTP)** with Supabase MFA, required for coach, staff, admin and entity. Every
  management access rule requires `aal2`. Because the rule is in the database, the web admin ships
  the same enrolment and challenge in the same release. Staff enrol at their first sign-in after the
  release.
- **Recovery:** an admin resets a lost factor. Email alone never resets it.
- **Step-up checks:** device biometrics or passcode before risky actions. For RGPD deletion, role and
  level changes, new staff accounts and exports, the server also requires a TOTP verification from
  the last few minutes, so the check holds on the web too.
- **Remote sign-out:** each profile gets a "sessions valid after" time. The database role helpers
  deny any session issued before it, so the sign-out takes effect at once on every device. This
  follows the immediate-deny pattern of ADR-025.
- **App lock:** optional for every role, stored on the device, locks after a set time in the
  background. On by default for management roles, and the user can turn it off.

## Player preview

Each organization has a preview player account with no personal data. "Preview as player" calls a
server function that confirms the caller's management role and `aal2`, then opens the preview session
in a separate read-only mode. The staff session is untouched. Staff never see a real player's private
data (messages, profile, sign-ups, drafts) through the app. Tracked as RAPP-171.

## State

- **Server state:** TanStack Query v5, cache persisted to encrypted MMKV with the key in the keychain,
  this device only (`apps/mobile/src/lib/storage.ts`).
- **Live updates:** Supabase Realtime events refresh the related queries (messages, Today counts,
  review queue).
- **Offline writes:** one shared outbox, generalised from the attendance sync worker, persisted in
  encrypted storage, retried on reconnect, with an idempotency key on every change.
- **Session, role, branding:** React Context, as today.
- **Screen state and drafts:** local state; drafts per item in encrypted storage. No global store
  library until a real cross-screen need appears.
- **Sensitive data:** queries that return decrypted personal fields stay in memory and are excluded
  from the persisted cache. The cache is wiped on sign-out, remote sign-out and role change.

## Errors

The existing translated error boundary and error codes. An outbox change the server rejects stays
visible with a plain message and a retry button, and is never dropped silently.

## Testing

A screen is done only when all of these pass:

- Role matrix: player, coach, staff, admin, entity and unknown against every route, in the app and on
  the web.
- pgTAP for the coach level, `aal2`, sessions valid after, and the preview account.
- Unit tests for every new shared module and outbox behavior.
- Device checks: low-end Android phone, iPhone, iPad, Android tablet; Arabic RTL; offline, then back
  online.
- Playwright for the web admin changes (TOTP, coach level, remote sign-out).
- Sentry checked clean for the QA window.

## Delivery

Each phase ships phone and tablet together.

1. Security foundation: route groups, coach level, TOTP on app and web, remote sign-out, app lock,
   step-up, cache rules, outbox, Realtime refresh.
2. Today and field work: staff tabs and tablet shell, Today, attendance, messages, material
   handovers with stock (RAPP-170), quick participant lookup.
3. Participants: list, profile, notes, activity, equipment history, invites, accounts, deletion
   requests.
4. Content: announcements, events, knowledge, services, review queue, block editor, player preview.
5. Community and support: forum and gallery moderation, mentoring, feedback, surveys, notifications.
6. Impact dashboard, reports and exports, Data and Settings.
7. Entity experience.

## Out of scope

- Custom per-organization permission sets. Three fixed management levels plus entity cover the need.
- Removing or reducing the web admin.
