/**
 * Who gave each answer on her page, and when (RAPP-653): she did, an entity
 * did (named by the entity), or a team member did (named by her). Every
 * answer carries its own origin (`participant_custom_answers`).
 */

export const ANSWER_SOURCES = ['player', 'entity', 'staff'] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

/** Where one answer came from. */
export interface AnswerOrigin {
  readonly source: AnswerSource;
  readonly answeredAt: string;
  /** The team member's name, or the entity's; null for hers or when unknown. */
  readonly answeredByName: string | null;
}
