/**
 * Staff notes about a participant (RAPP-24).
 *
 * One field, and it still lives here rather than inline in the admin form, for
 * the reason the whole `schemas/` folder exists: the database enforces
 * `length(btrim(body)) between 1 and 4000`, and the only way that rule stays
 * ONE rule is if the client checks the same one. Otherwise the two drift, and
 * the drift surfaces as Postgres refusing a write the form said was fine.
 *
 * Notes are deliberately free text. Unlike the enumerable profile fields
 * (CLAUDE.md rule 18), a note about a person is a genuinely open answer: there
 * is no authoritative list of the things a team needs to remember about her.
 */

import { z } from 'zod';

/** Matches the column's CHECK constraint exactly. */
export const PARTICIPANT_NOTE_MAX_LENGTH = 4000;

export const participantNoteSchema = z.object({
  body: z.string().trim().min(1).max(PARTICIPANT_NOTE_MAX_LENGTH),
});

export type ParticipantNoteDraft = z.infer<typeof participantNoteSchema>;
