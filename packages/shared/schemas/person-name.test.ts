import { describe, expect, it } from 'bun:test';
import { inviteEntityCollaboratorSchema } from '../entity-management';
import { createParticipantInviteSchema } from './accounts';
import { identityStepSchema } from './onboarding';
import { personNameSchema, trimPersonName } from './person-name';

/** The same characters the database test (0121) refuses as a whole name. */
const BLANK_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['a tab', '\t'],
  ['a newline', '\n'],
  ['a no-break space', '\u00A0'],
  ['an ideographic space', '\u3000'],
  ['a zero-width space', '\u200B'],
  ['a zero-width non-joiner', '\u200C'],
  ['a zero-width joiner', '\u200D'],
  ['a word joiner', '\u2060'],
  ['a byte order mark', '\uFEFF'],
  ['an en space', '\u2002'],
  ['a mix of them', '\u00A0\u200B\t\u3000\uFEFF'],
];

describe('person names (RAPP-624)', () => {
  it.each(BLANK_NAMES)('refuses a name made only of %s', (_label, value) => {
    expect(personNameSchema.safeParse(value).success).toBe(false);
    expect(identityStepSchema.shape.firstName.safeParse(value).success).toBe(false);
    expect(
      createParticipantInviteSchema.safeParse({
        email: 'prova@example.test',
        firstName: 'Amina',
        lastName: value,
      }).success,
    ).toBe(false);
    expect(
      inviteEntityCollaboratorSchema.safeParse({
        email: 'entitat@example.test',
        firstName: value,
        lastName: 'Prova',
      }).success,
    ).toBe(false);
  });

  it('trims invisible characters from the edges and keeps inner spaces', () => {
    expect(trimPersonName('\u200B\u00A0Joana\u3000')).toBe('Joana');
    expect(personNameSchema.parse('\uFEFF\u2060 Fatima \u200D')).toBe('Fatima');
    expect(personNameSchema.parse('Ana\u00A0Maria')).toBe('Ana\u00A0Maria');
  });

  it('bounds the length after trimming', () => {
    const wrapped = ['\u200B', 'a'.repeat(100), '\u200B'].join('');
    expect(personNameSchema.safeParse(wrapped).success).toBe(true);
    expect(personNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});
