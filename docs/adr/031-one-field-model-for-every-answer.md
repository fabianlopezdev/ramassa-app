# 031. One field model for every answer, the app's own fields included

**Status:** Accepted
**Date:** 2026-10-25 (Fabián's rule the same day; built in RAPP-660 to RAPP-666)

> Extends [ADR-030](030-profile-fields-and-placements.md) to the app's own fields and replaces its
> decision 4 (the required list). Keeps [ADR-004](004-encryption-day-one.md) (Sensitive answers
> encrypted), [ADR-021](021-audit-log-no-plaintext-of-encrypted-fields.md) (no plaintext of an
> encrypted value in the audit log) and [ADR-023](023-rgpd-erasure-in-postgres-with-a-media-receipt.md)
> (erasure in Postgres).

## Context

ADR-030 made the team's questions fields with placements. The app's own questions (date of birth,
nationality, document, phone, sizes, the season answers) stayed columns on `profiles`, with their
type and privacy fixed in code, their season history in `season_answers`, who answered them in
`profile_answers`, and their per-question settings in four tables keyed by the question's name
(`intake_question_states`, `intake_required_questions`, `builtin_question_overrides`, plus the
static `private.wizard_screen_questions()` map).

Fabián, 2026-10-25: Dades de les jugadores decides which data Ramassà gathers, the kind of answer
for each and how private it is, for every field, the app's included. "This is how we should have
done it from the beginning." Production did not exist yet, so no real data had to move.

## Decision

Every answer is an answer to a field. The decisions below are numbered as in the design (section
14.1 of the player profile layout design).

1. **D1. One kind of field.** `builtin_key` became `system_key`: an optional stable name that
   features look up. It says nothing about what can be edited.
2. **D2. Names are the one exception.** `first_name` and `last_name` stay account columns on
   `profiles`; their wording is editable, their type, privacy and placement on her identity screen
   are not, and they are never archived. Her app language is an account setting, never a field.

   > **Superseded 2026-10-26 by RAPP-693.** Fabián: "Everything can be editable and we can then
   > make decisions for them." Her names are answers in `custom_answers` like every field, with an
   > editable type, privacy and options; a type change follows D8. They stay never archived and on
   > her identity screen. One display rule (`private.shown_name`, `private.display_name`) shows them
   > to herself, to a team member with the permission of their level, and to a fellow player while
   > they are Normal; anyone else reads her number, "Jugadora 0042" (`profiles.member_number`), in
   > their own language. `profiles.first_name` and `last_name` stay for team accounts; for a player
   > they are a copy that never holds more than the Normal level, kept by triggers. Migration
   > `20261026160000_names_fully_editable.sql`. Her app language is still an account setting.
3. **D3. One answer store.** Every other field answers into `custom_answers` through
   `private.write_custom_answer`: one row per field (per season for a seasonal field), Sensitive
   answers encrypted.
4. **D4. Composite fields are split** into simple ones: document type, number and name;
   has dependants and how many; applicant status and its details; specific needs and one details
   text.
5. **D5. Options carry a stable `key`** (the old enum string), so features and conversions match an
   option whatever its wording.
6. **D6. Two list types ship with the app:** `country` and `municipality` (the IDESCAT catalog). The
   500-option cap of hand-made lists does not apply.
7. **D7. Features declare what they read** in one registry, in SQL (`private.field_features()`) and
   in shared code (`FIELD_FEATURES`): age bands and erasure read the date of birth, nationality
   grouping the country, the list the municipality, audiences the entity, equipment the sizes. A
   feature skips a field whose type no longer fits; nothing crashes.
8. **D8. Changing an answered field** is allowed behind a dialog. `preview_field_change` counts
   what converts, what does not, who gains or loses access and which features stop; saving converts
   in one transaction and sets aside what does not fit in her history (the audit log, encrypted).
9. **D9. One privacy path.** Read access per answer follows its field's level
   (`participants.view`, `view_personal`, `view_sensitive`); the apps and exports read the level
   from the layout.
10. **D10. Seasons.** A seasonal field keeps one answer per season; `season_answers` moved into
    those rows.
11. **D11. Erasure covers every answer.** `anonymize_participant` deletes them all and keeps only
    the birth year while the date of birth is still a date.
12. **D12. Search.** `participant_search_documents` indexes her names and her Normal and Personal
    text answers, refreshed on write. Sensitive answers are never searchable.
13. **D13. Data moves, then the old storage goes.** The values were copied into answers
    (RAPP-660), kept in sync while writers and readers moved (RAPP-661 to RAPP-665), then dropped
    (RAPP-666): the app's columns on `profiles` (with `search_document` and the municipality foreign
    key), `season_answers`, `profile_answers`, `intake_question_states`, `intake_required_questions`,
    `builtin_question_overrides`, `private.wizard_screen_questions()`, the sync and snapshot
    triggers and every helper of the old payloads.
14. **D14. Onboarding.** The app's screens hold placements like Ramassà screens. A screen draws a
    question with its own control while the question's first field is placed there and the control
    can read every field of it; otherwise the generic renderer asks the fields where they are
    placed. The same rule holds on her own edit and the staff phone's edit, so no field disappears
    from an edit screen. Drafts are versioned, so an old draft is converted, never lost.
15. **D15. Build order.** Expand, move the writers, move the readers, move the apps, then the page
    and its change dialog, then contract. Each step left the branch building.

The per-question settings that lived in the side tables now live on fields and placements:

- **Ask or Don't ask** on an app question is a `custom_question_states` row of its first field. The
  wire keeps the question's name (`set_intake_question_states`, `participant_question_states`,
  `my_questions_to_ask`).
- **Wording** of an app question is its first field's onboarding placement wording. **Hiding** it
  takes its fields off her onboarding and her season form; showing it places them back on their own
  screen. The catalog's `overrides` list is read from the placements.
- **Required** is the first field's onboarding and season placement flag, set on both together.
  `required_intake_questions` reads it; her names and app language are always required.
- **The app screen of each field** is a column of `private.system_profile_fields()`.
- **The setup file** stays version 3. An export writes `builtin_question_overrides` and
  `required_questions` empty; an older file's lists land on the placements and the field's
  options on import.

## Alternatives Considered

- **Keep the app's columns and add a level per column.** Two answer stores, two encryption paths
  and two privacy checks, and a type change would still need a schema migration per field.
- **A JSON column of answers on `profiles`.** One row per woman, but per-answer privacy, per-season
  history and the encrypted Sensitive values would all live inside one value no policy can see.
- **Keep the side tables, keyed by field id.** Wording, required and hiding already had a home on
  placements; a second home is how the two drift.
- **Drop the old storage in one step.** Every reader and writer would have changed at once, with no
  point where the branch built and the database tests passed in between.

## Consequences

- One write path (`private.write_field_answers` and `private.write_custom_answer`), one read path
  (`answers` by field id), one privacy rule and one erasure rule for every field.
- Staff change a field's type, options, privacy or placement on Dades de les jugadores; the apps
  follow without a release.
- The logger redacts an `answers` object whole, since no key inside it names what it holds.
- A field id is the contract between the apps and the database. A build older than this model
  sends column keys, and every writer refuses them: the migrations and new app builds deploy
  together.
- `entity_referrals.referred_phone` and `intake_answers` remain: the first is the referral's own
  contact as it was sent before RAPP-661, the second holds only her season count.
