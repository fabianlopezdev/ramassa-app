# 032. A half-answered form is kept on the server, encrypted

**Status:** Accepted
**Date:** 2026-11-20 (RAPP-886)

> Keeps [ADR-004](004-encryption-day-one.md) (Sensitive answers encrypted) and
> [ADR-023](023-rgpd-erasure-in-postgres-with-a-media-receipt.md) (erasure in Postgres).

## Context

Her answers to a form the team created lived only on the screen (RAPP-825): leaving half way lost
them, and the Per fer card could not say "Continua" as a started survey does. Fabián asked for a form
to keep her answers so far and open again where she left it.

Two patterns already existed. Her Onboarding keeps its draft on the phone, in the encrypted private
storage, per account (`packages/shared/lib/onboarding-drafts.ts`, `apps/mobile/src/lib/wizard-draft.ts`).
A survey keeps a started response on the server, encrypted with the field key
(`save_survey_response`, status `in_progress`).

## Decision

1. **On the server, like a survey.** `custom_form_progress` holds one row per ask: the screen she left
   and her answers so far, encrypted whole with `encrypt_field`. A reinstall or another phone opens
   the form where she left it, and the Continua mark comes from one call (`my_started_custom_forms`).
2. **Only what differs from her record**, and only for fields the form asks. Her signatures and
   consent ticks are given when she sends the form, so they are never kept.
3. **Only she reads it.** No team policy on the table; `my_custom_form_progress` decrypts for her
   alone. The team's lists, counts and exports read `custom_form_responses`, where the ask stays
   pending until she sends it.
4. **Lifecycle in the database.** Sending, deleting, a withdrawn form and a form the team fills
   remove the row (triggers); putting the form off keeps it; a new version keeps only the answers to
   fields the form still asks; erasure removes it with the ask and her account (cascade and the
   registry).
5. **Offline, nothing new.** The walk works offline as before and keeps nothing while offline; the
   next save once she is online carries everything. A walk that opened without her kept answers never
   saves, so it cannot replace them.

## Alternatives Considered

- **On the phone, like her Onboarding draft.** Lost on a reinstall or another phone, and the Per fer
  mark would differ by device.
- **Answers written into her record as she goes.** The team would read unsent answers as hers, and a
  form she deletes would leave them behind.

## Consequences

- One more table in the erasure registry and one more encrypted value per started form.
- The form walker reports her answers so far (`onProgress`) when she moves between screens and when
  she leaves; typing on a screen she leaves by closing the app is kept only up to her last move.
