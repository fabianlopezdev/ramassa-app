import { describe, expect, it } from 'bun:test';
import { walkInNameSchema } from '../authorization/tablet';
import { inviteEntityCollaboratorSchema } from '../entity-management';
import { createReferralSchema } from '../referrals';
import { createParticipantInviteSchema } from './accounts';
import { identityStepSchema } from './onboarding';
import { personNameSchema, trimPersonName } from './person-name';

/** The same characters the database tests (0121, 0125) refuse as a whole name. */
const BLANK_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['a tab', '\t'],
  ['a newline', '\n'],
  ['a next line U+0085', '\u0085'],
  ['a no-break space', ' '],
  ['an ideographic space', '　'],
  ['a zero-width space', '​'],
  ['a zero-width non-joiner', '‌'],
  ['a zero-width joiner', '‍'],
  ['a word joiner', '⁠'],
  ['a byte order mark', '﻿'],
  ['an en space', ' '],
  ['a left-to-right mark U+200E', '‎'],
  ['a right-to-left mark U+200F', '‏'],
  ['an Arabic letter mark U+061C', '؜'],
  ['a soft hyphen U+00AD', '­'],
  ['a combining grapheme joiner U+034F', '͏'],
  ['an invisible times U+2062', '⁢'],
  ['a right-to-left override U+202E', '‮'],
  ['a left-to-right isolate U+2066', '⁦'],
  ['a Hangul filler U+3164', 'ㅤ'],
  ['a halfwidth Hangul filler U+FFA0', 'ﾠ'],
  ['a Hangul choseong filler U+115F', 'ᅟ'],
  ['a Khmer inherent vowel U+17B4', '឴'],
  ['a Mongolian variation selector U+180B', '᠋'],
  ['a variation selector U+FE0F', '️'],
  ['a tag space U+E0020', '\u{E0020}'],
  ['a variation selector U+E0100', '\u{E0100}'],
  ['a combining acute accent U+0301', '́'],
  ['two combining marks', '́̈'],
  ['an Arabic fatha U+064E', 'َ'],
  ['a combining mark between invisible characters', '​́‎'],
  ['a mix of them', ' ​\t　﻿‎\u{E0020}'],
];

/** A real letter with an invisible character is still a name. */
const MIXED_NAMES: ReadonlyArray<readonly [string, string, string]> = [
  ['a trailing left-to-right mark', 'Amina‎', 'Amina'],
  ['a leading right-to-left mark', '‏أمينة', 'أمينة'],
  ['a leading tag character', '\u{E0020}Joana', 'Joana'],
  ['an inner zero-width non-joiner (Persian)', 'مه‌رو', 'مه‌رو'],
  ['an inner soft hyphen', 'Ana­Maria', 'Ana­Maria'],
  ['a letter with a combining accent', 'José', 'José'],
  ['a letter after a leading combining mark', '́a', '́a'],
];

describe('person names (RAPP-624)', () => {
  it.each(BLANK_NAMES)('refuses a name made only of %s', (_label, value) => {
    expect(trimPersonName(value)).toBe('');
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
    expect(walkInNameSchema.safeParse({ firstName: 'Rim', lastName: value }).success).toBe(false);
    expect(
      createReferralSchema.safeParse({
        firstName: value,
        lastName: 'Sylla',
        documentationStatus: 'missing',
        consentConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it.each(MIXED_NAMES)('accepts a name with %s', (_label, value, saved) => {
    expect(personNameSchema.parse(value)).toBe(saved);
    expect(walkInNameSchema.parse({ firstName: value, lastName: 'Haddad' }).firstName).toBe(saved);
  });

  it('trims invisible characters from the edges and keeps inner spaces', () => {
    expect(trimPersonName('​ Joana　')).toBe('Joana');
    expect(personNameSchema.parse('﻿⁠ Fatima ‍')).toBe('Fatima');
    expect(personNameSchema.parse('Ana Maria')).toBe('Ana Maria');
  });

  it('an entity contact name of only invisible characters is no answer', () => {
    const referral = createReferralSchema.parse({
      firstName: 'Awa',
      lastName: 'Sylla',
      documentationStatus: 'missing',
      referenceContactName: '‎ㅤ',
      consentConfirmed: true,
    });
    expect(referral.referenceContactName).toBeNull();
  });

  it('bounds the length after trimming', () => {
    const wrapped = ['​', 'a'.repeat(100), '\u{E0020}'].join('');
    expect(personNameSchema.safeParse(wrapped).success).toBe(true);
    expect(personNameSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });
});
