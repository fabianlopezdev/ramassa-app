# 030. Player information as fields, placed on surfaces

**Status:** Accepted
**Date:** 2026-10-23 (design approved by Fabián the same day; built in RAPP-649)

> Builds on [ADR-004](004-encryption-day-one.md) (Sensitive answers encrypted) and
> [ADR-009](009-rls-over-app-auth.md) (row security over app checks).

## Context

A staff question (`custom_questions`, RAPP-307) held three things at once: what Ramassà wants to
know about a player (type, privacy level), where it is asked (`screen_id`, `placements[]`) and how it
is worded. As Marc designed the onboarding (RAPP-641 to RAPP-647), this showed three problems:

- The same piece of information could be created twice, under two names, by two forms.
- The privacy level was chosen on a question form, while it is a property of the information.
- Her onboarding, the entity referral form and the team all write into one profile, but only the
  app's own columns were shared between them. A question added to an app screen needed a "holder"
  screen row (RAPP-642) to have somewhere to live.

## Decision

1. **A field is what we know. A placement is where we ask. A surface is the place.**
   - `profile_sections`: the sections of her profile, seven per organization, renamable.
   - `profile_fields`: one piece of information with its type, privacy level, default required flag,
     options and creator. Built-in fields are the app's own questions (`builtin_key`), with the
     level the database already fixes for their columns. Custom fields are what staff add.
   - `field_placements`: a field on a surface (`onboarding` at one screen, `entity_form`, `season`),
     with its order, required on that surface, and an optional wording per language. At most one
     placement per field and surface. A field with no placement is filled in by the team only.
2. **Ids are kept.** Every question became a field with the same id. Answers, per-player choices,
   referral answers, exports, reports and the launch script key by that id, so none of them moved.
   The foreign keys now point at `profile_fields`.
3. **Expand, then contract.** `custom_questions` is now a view with the old columns in the old
   order, with the caller's row security (`security_invoker`). Every reader works unchanged.
   INSTEAD OF triggers write old-shape rows into fields and placements, so a version 1 setup file
   and the tests written for the old table still work. The old writer functions are thin wrappers
   over the same private workers as the new ones. RAPP-656 removes the view, the wrappers, the
   holder screens and `legacy_screen_id`.
4. **One required list for the built-in questions.** `intake_required_questions` stays the source;
   the built-in onboarding and season placements mirror it, and `save_placement` on one of them goes
   through `save_builtin_question_required`.
5. **Privacy is enforced where it was.** Reads by level (`participant_custom_answers`), encryption
   on write (`private.write_custom_answer`) and exports by scope are unchanged. A field's level can
   change only while nothing was answered for it.

## Alternatives Considered

- **Keep the question table and add a surface list.** The information would stay owned by a
  question form, and the same information could still be created twice.
- **Rename `custom_questions` to `profile_fields` in place.** Fewer statements, but the three
  functions that take a question row would have changed their argument type under every caller,
  and the old shape would have had no stable reader contract during the move.
- **One placement table per surface.** Three copies of the same order, required and wording
  logic, and a field could not be asked "everywhere it is placed" with one query.
- **Archive the holder screens now.** Her app of today still reads added questions through the
  holder; archiving them before RAPP-655 would have changed her onboarding on staging.

## Consequences

- The Fitxa page, the onboarding field picker and the entity form editor (RAPP-650 to RAPP-653)
  write through `save_profile_field`, `place_field`, `save_placement` and their siblings, and read
  `sections`, `fields` and `placements` from `intake_catalog`.
- The setup file is schema version 2 with the layout; version 1 still imports.
- Until RAPP-656 there are two shapes of the same data. The view is the only bridge, and it is
  read-only for `authenticated`.
- The old `placements[]` could say `season` without `wizard`; both always meant she is asked in
  her onboarding too, so the view now says `wizard, season` for both.

### After the contract step (RAPP-656, 2026-10-24)

- One shape remains. The view `custom_questions`, its INSTEAD OF trigger, the old writers
  (`save_custom_question`, `archive_custom_question`, `reorder_custom_questions`,
  `save_custom_question_required`, `ensure_builtin_screen_holder`, `save_referral_custom_answers`),
  the holder screens, `intake_screens.builtin_screen` and `profile_fields.legacy_screen_id` are
  gone (migration `20261024000000_remove_the_old_question_model.sql`).
- A Ramassà field reaches her only through a placement. Required for her means a required
  placement on her onboarding or her season form; seasonal means placed on the season form.
  `private.write_custom_answer` takes a `profile_fields` row.
- Archiving a Ramassà screen removes the placements on it. The fields stay on the Fitxa with their
  answers, and the team can place them again.
- The setup file is schema version 3: screens, sections, fields and placements, nothing else about
  them. Versions 1 and 2 still import, read as version 3 by
  `private.onboarding_setup_as_version_3`: a holder becomes the app screen it held, a version 1
  question becomes a field with its placements, and the organization keeps its own built-in
  placements.
- The custom answers export names the Fitxa section of each answer in place of a screen.
- The Settings question builder and its Questions tab are gone; `/settings?tab=questions` opens
  the Fitxa. The Onboarding board orders and words the screens.
- The entity's answers to Ramassà fields travel only inside `create_entity_referral`; a required
  one left out refuses the referral.

### After the app's own fields became fields (RAPP-666, 2026-10-25)

- Decision 4 is replaced by [ADR-031](031-one-field-model-for-every-answer.md): the required flag
  of an app question lives on its first field's placements, and `intake_required_questions` is
  gone. Built-in fields are now any field with a `system_key`, editable like a Ramassà field except
  her names.
