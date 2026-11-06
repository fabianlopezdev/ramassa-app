/**
 * Her names wherever staff placed them (RAPP-782).
 *
 * Her name screen asks Nom and Cognoms with its own control. Staff may move
 * either one to another screen: there the generic renderer asks it, prefilled
 * with what staff gave and required as always, and keeps her answer by field
 * id. Her identity in the draft still names her for the checks every screen
 * shares and for the names her completion sends, so a name asked elsewhere is
 * read from that answer. Pure: no React, so bun tests run it.
 */
import { ACCOUNT_NAME_KEYS } from '@ramassa/shared/intake';
import {
  questionsOffTheirControl,
  type CustomAnswers,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';

const IDENTITY_KEY = { first_name: 'firstName', last_name: 'lastName' } as const;

/**
 * The draft with each name staff moved off her name screen taken from her
 * answer on the screen it sits on; the draft as it is when none moved.
 */
export function withPlacedNames(
  draft: OnboardingDraft | null,
  catalog: IntakeCatalog | undefined,
  answers: CustomAnswers,
): OnboardingDraft | null {
  const layout = catalog?.layout;
  if (draft === null || layout === undefined) return draft;
  const off = questionsOffTheirControl(layout);
  const names = Object.fromEntries(
    ACCOUNT_NAME_KEYS.flatMap((key) => {
      if (!off.has(key)) return [];
      const field = layout.fields.find((each) => each.systemKey === key);
      const value = field === undefined ? undefined : answers[field.id];
      return [[IDENTITY_KEY[key], typeof value === 'string' ? value : '']];
    }),
  );
  return Object.keys(names).length === 0
    ? draft
    : { ...draft, identity: { ...draft.identity, ...names } };
}
