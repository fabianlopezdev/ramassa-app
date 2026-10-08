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

## Account types and permissions

> Revised 2026-10-08 (same day): fixed management levels were replaced by permissions that admins
> toggle per person, with presets. Fabián's reason: an organization must be able to give someone
> access to one job only (for example material stock, attendance, or creating user accounts), and
> the white-label product needs this flexibility.

### Account types

| Account type       | Experience in the app                                           |
| ------------------ | --------------------------------------------------------------- |
| player             | The five player tabs, unchanged.                                |
| team member        | Only the areas their permissions allow. Replaces staff/admin.   |
| entity             | The entity portal: Home, Referrals, Services, Events, Messages. |
| unknown or missing | A plain "no access" screen. Never the player tabs.              |

Entity accounts keep a fixed portal for now. The same permission system can extend to them later
if an organization needs it.

### Permission catalog

A fixed list of small permissions, defined in code and in the database, with a test that keeps the
two lists equal (the same pattern as the equipment catalog). Each permission is one toggle. First
draft, to finalize in phase 1:

- `attendance.mark`, `attendance.reports`
- `events.manage`, `announcements.manage`, `knowledge.manage`, `services.manage`,
  `services.review`, `content.publish`
- `participants.view`, `participants.view_sensitive` (address, postal code, phone, document
  number), `participants.notes`, `participants.invite`, `accounts.create`, `participants.deactivate`,
  `rgpd.erase`
- `equipment.stock`, `equipment.handover`
- `messages.use`, `forum.moderate`, `gallery.moderate`, `mentoring.manage`, `feedback.view`,
  `surveys.manage`, `notifications.send`
- `referrals.manage`, `entities.manage`
- `impact.view`, `data.export`, `audit.view`
- `settings.organization`, `settings.branding`, `settings.documents`, `team.manage` (people,
  presets, permissions, remote sign-out)

### Presets

- **Built-in presets** are starting templates: Coach (attendance, events, messages, equipment
  handover, participants view without sensitive fields), Staff (all day-to-day work, no Data and no
  Settings), Admin (everything).
- **Organization presets:** admins create, rename and delete their own presets (for example
  "Material manager" or "Account creator").
- **Applying a preset copies its toggles to the person.** The admin can then change single toggles.
  The person shows "Coach, adjusted" when the toggles differ from the preset. Editing a preset later
  offers "Apply to the N people who use it". Nobody's access changes without an explicit action.

### Enforcement and safety

- Every management access rule calls a database helper, `has_permission('<code>')`, wrapped in a
  sub-select so PostgreSQL evaluates it once per query. The helper reads the live permission table,
  so a change takes effect at once, with no new sign-in.
- Decryption of sensitive fields requires `participants.view_sensitive`, which is off in every
  preset except Admin.
- An organization always keeps at least one person with `team.manage`.
- A person can grant only permissions they hold themselves.
- Every change to permissions or presets goes to the audit log.
- The second factor is required for every team member with any permission, and for entities.

### Migration

The current `staff` and `admin` roles become team members with the Staff and Admin presets. Every
RLS policy that checks `current_app_role() in ('staff', 'admin')` moves to `has_permission`. This
is the largest piece of phase 1, and the role matrix test turns into a permission matrix test.

## Languages

- **Staff side** (the web dashboard, team member screens and entity screens in the app): Catalan,
  Spanish and English. Catalan stays the default.
- **Players:** Catalan, Spanish, English, Arabic and Farsi, with full right-to-left support, as in
  ADR-006.
- **Player content** written by staff (announcements, events, knowledge, services) keeps all five
  languages. The editor keeps five language tabs.
- A team member whose saved language is Arabic or Farsi sees the staff side in Catalan, and can pick
  Spanish or English.

## Navigation

Menus are built from the person's permissions. A person with one permission gets that one screen
and no empty tabs.

- **Player:** five tabs, as today.
- **Entity:** Home (impact on the women they referred), Referrals, Services, Events, Messages. This
  matches `ENTITY_NAV_ITEMS` in `apps/admin/src/lib/nav-items.ts`.
- **Team member (phone), up to five tabs:**
  - **Today:** actions that need doing now and that the person is allowed to do. For example
    today's sessions with one tap to take attendance, unread messages, services waiting for review,
    forum reports, mentoring requests, deletion requests.
  - **Participants:** search, filters, profile card, notes, material handovers, invites.
  - **Content:** announcements, events, knowledge base, services, review queue.
  - **Messages.**
  - **More:** impact dashboard, stock, forum moderation, mentoring, feedback, notifications,
    surveys, player preview, data, settings, team, my security settings.
  - Tabs with no allowed area are hidden. With one or two areas allowed, the app shows them as a
    simple home screen with large buttons.
- **Tablet:** a sidebar with every allowed area and list-and-detail split views.

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
  error messages, WCAG AA. Player screens keep five languages and RTL; staff screens use CA, ES, EN.

## Authentication and authorization

- **Players:** email code as today, plus an optional app lock.
- **Second factor (TOTP)** with Supabase MFA, required for every team member and every entity
  account. Every management access rule requires `aal2`. Because the rule is in the database, the web admin ships
  the same enrolment and challenge in the same release. Staff enrol at their first sign-in after the
  release.
- **Recovery:** a person with `team.manage` resets a lost factor. Email alone never resets it.
- **Step-up checks:** device biometrics or passcode before risky actions. For RGPD deletion, permission and
  preset changes, new accounts and exports, the server also requires a TOTP verification from
  the last few minutes, so the check holds on the web too.
- **Remote sign-out:** each profile gets a "sessions valid after" time. The database role helpers
  deny any session issued before it, so the sign-out takes effect at once on every device. This
  follows the immediate-deny pattern of ADR-025.
- **App lock:** optional for every role, stored on the device, locks after a set time in the
  background. On by default for team members, and the user can turn it off.

## Player preview

Each organization has a preview player account with no personal data. "Preview as player" calls a
server function that confirms the caller is a team member with `aal2`, then opens the preview session
in a separate read-only mode. The staff session is untouched. Staff never see a real player's private
data (messages, profile, sign-ups, drafts) through the app. Tracked as RAPP-171.

## State

- **Server state:** TanStack Query v5, cache persisted to encrypted MMKV with the key in the keychain,
  this device only (`apps/mobile/src/lib/storage.ts`).
- **Live updates:** Supabase Realtime events refresh the related queries (messages, Today counts,
  review queue).
- **Offline writes:** one shared outbox, generalised from the attendance sync worker, persisted in
  encrypted storage, retried on reconnect, with an idempotency key on every change.
- **Session, account type, permissions, branding:** React Context. Permissions reload on a Realtime
  change to the person's permission rows, so menus update at once.
- **Screen state and drafts:** local state; drafts per item in encrypted storage. No global store
  library until a real cross-screen need appears.
- **Sensitive data:** queries that return decrypted personal fields stay in memory and are excluded
  from the persisted cache. The cache is wiped on sign-out, remote sign-out and any permission change.

## Errors

The existing translated error boundary and error codes. An outbox change the server rejects stays
visible with a plain message and a retry button, and is never dropped silently.

## Testing

A screen is done only when all of these pass:

- Permission matrix: each permission granted alone, against every route and every RLS policy, in
  the app and on the web. Plus player, entity and unknown account types, and the built-in presets.
- pgTAP for `has_permission`, the safety rules (last `team.manage` holder, no granting above your
  own permissions, audit log), `aal2`, sessions valid after, and the preview account.
- Unit tests for every new shared module and outbox behavior.
- Device checks: low-end Android phone, iPhone, iPad, Android tablet; Arabic RTL on player screens;
  offline, then back online.
- Playwright for the web admin changes (TOTP, permissions and presets screens, remote sign-out).
- Sentry checked clean for the QA window.

## Delivery

Each phase ships phone and tablet together.

1. Security foundation: route groups, the permission catalog with presets and per-person toggles
   (database, RLS migration and the web admin Team screen), TOTP on app and web, remote sign-out,
   app lock, step-up, cache rules, outbox, Realtime refresh, staff-side languages cut to CA, ES, EN.
2. Today and field work: staff tabs and tablet shell, Today, attendance, messages, material
   handovers with stock (RAPP-170), quick participant lookup.
3. Participants: list, profile, notes, activity, equipment history, invites, accounts, deletion
   requests.
4. Content: announcements, events, knowledge, services, review queue, block editor, player preview.
5. Community and support: forum and gallery moderation, mentoring, feedback, surveys, notifications.
6. Impact dashboard, reports and exports, Data and Settings, the native Team screen (people,
   presets, toggles).
7. Entity experience.

## Out of scope

- Permission toggles for entity accounts (possible later with the same system).
- Removing or reducing the web admin.
