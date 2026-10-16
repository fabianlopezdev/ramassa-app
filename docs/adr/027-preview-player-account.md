# 027. A preview player account per organization

**Status:** Accepted
**Date:** 2026-10-14 (option chosen by Fabián on 2026-10-08)

> Builds on [ADR-022](022-account-creation-without-service-role-key.md) (accounts are created in
> Postgres, and no service-role key exists) and [ADR-026](026-native-management-in-the-mobile-app.md)
> ("Preview as player" for every team member).

> [!note] Amended 2026-10-14 (RAPP-372): the web admin opens the preview in the player web app.
> The admin starts the preview with the person's own session and hands the address and password to
> a new tab of the player web app with `postMessage`, between the two configured origins only
> (`EXPO_PUBLIC_PLAYER_WEB_URL`, `EXPO_PUBLIC_ADMIN_WEB_URL`). Leaving closes the tab.

## Context

A team member must be able to see, at any moment, what players see in the app, to confirm that a
change they made shows as expected. Staff must never see a real player's private data while doing
so: her messages, her profile, her sign-ups or her drafts. That rules out impersonating a real
player.

Three options were weighed: a preview player account per organization, a "view as player" switch
that applies player filters in the app's own queries, and a per-item preview in the web admin.
Fabián chose the first, because it uses the real player permissions and so shows exactly what a
player sees.

## Decision

1. Each organization has one preview account, `profiles.role = 'preview'`, with no personal data.
   It is created on first use, the way ADR-022 creates accounts.
2. `current_app_role()` reports the preview as `player`. Every player read policy goes through that
   function, so the preview reads what a player reads. Every staff list, count, export and push
   audience selects `role = 'player'`, so the preview account stays out of all of them.
3. Every request of the preview account is read-only in the database. PostgREST's pre-request hook
   (`private.player_preview_pre_request`, set on the `authenticator` role) makes its transaction
   read-only, so Postgres refuses every write, including writes inside SECURITY DEFINER functions,
   and nothing can make the transaction writable again. The media worker refuses its uploads
   (`isFolderWritableBy`).
4. `start_player_preview()` is a SECURITY DEFINER function. It accepts only a team member with
   `aal2` and a current session (`is_team_member()`), is rate-limited and audited, gives the preview
   account a new random password, and returns the address and password once. The app signs in with
   them on a second client, so the team member's own session is untouched.

## Alternatives Considered

- **An Edge Function that asks the auth server for a one-time sign-in token.** Built first and
  working, then removed, because it needs the service-role key, which ADR-022 removed from this
  system.
- **Player filters in the app's queries.** Simpler, but it can drift from the real row security
  rules, and every per-player item would need its own filter.
- **A per-item preview in the web admin only.** Covers "is my change reflected" but not the whole
  player experience, and not on the phone.

## Consequences

- The preview is exact: it is a real player session under the real policies.
- No staff screen needs a change to hide the preview account, because none selects it.
- A leaked preview password opens only a read-only player view, and the next start replaces it.
  It is stored only as its hash.
- Two team members starting a preview in the same second: the first one's password is replaced
  before she signs in. The app starts again once when the sign-in is refused.
- The pre-request hook runs on every API request. It is one indexed lookup of the caller's profile.
- **What to watch:** a platform setting for `pgrst.db_pre_request` would replace ours. pgTAP
  (`0063`) and `bun run db:test:player-preview` check that the preview cannot write.
- An unpublished draft is not visible to the preview, as it is not to players. A draft preview in
  the editor needs the player screens to render values they are given (tracked separately).
