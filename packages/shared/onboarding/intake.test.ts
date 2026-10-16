/**
 * Which questions the wizard asks, in which order, and what it sends
 * (RAPP-300). Staff or an entity may have answered part of a woman's intake
 * before her first login; the wizard asks only the rest, then shows a summary,
 * and sends only what is new or changed so nothing stored is overwritten.
 */
import { describe, expect, test } from 'bun:test';
import {
  answeredQuestionsSchema,
  INTAKE_QUESTIONS,
  nextWizardScreen,
  previousWizardScreen,
  screensToAsk,
  trimPayloadToAnswers,
  wizardScreenPosition,
  type IntakeQuestion,
} from './intake';

const answered = (...questions: IntakeQuestion[]) => new Set<IntakeQuestion>(questions);

describe('screensToAsk', () => {
  test('a woman nobody prefilled gets every screen', () => {
    expect(screensToAsk(answered())).toEqual([
      'identity',
      'background',
      'documentation',
      'logistics',
    ]);
  });

  test('a screen whose questions are all answered is skipped', () => {
    expect(screensToAsk(answered('first_name', 'last_name', 'document'))).toEqual([
      'background',
      'logistics',
    ]);
  });

  test('one unanswered question keeps its screen', () => {
    expect(screensToAsk(answered('date_of_birth', 'place_of_birth', 'nationality'))).toContain(
      'background',
    );
  });

  test('the avatar is never a reason to show a screen, because the wizard does not ask it', () => {
    const everythingButAvatar = INTAKE_QUESTIONS.filter((question) => question !== 'avatar');
    expect(screensToAsk(new Set(everythingButAvatar))).toEqual([]);
  });

  test('the contact person follows the entity: answering the entity alone keeps the screen', () => {
    const allLogisticsButContact = answered(
      'phone',
      'address',
      'city',
      'postal_code',
      'reference_entity',
      'dependents',
      'clothing_size',
      'shoe_size',
    );
    expect(screensToAsk(allLogisticsButContact)).toContain('logistics');
  });
});

describe('navigation', () => {
  const plan = answered('first_name', 'last_name', 'document');

  test('the wizard starts at the first screen it has to ask', () => {
    expect(nextWizardScreen('start', plan)).toBe('background');
  });

  test('it moves to the next screen with questions, skipping answered ones', () => {
    expect(nextWizardScreen('background', plan)).toBe('logistics');
  });

  test('after the last question screen comes the summary, then the terms', () => {
    expect(nextWizardScreen('logistics', plan)).toBe('summary');
    expect(nextWizardScreen('summary', plan)).toBe('terms');
  });

  test('a fully prefilled woman goes straight to the summary', () => {
    const all = new Set(INTAKE_QUESTIONS);
    expect(nextWizardScreen('start', all)).toBe('summary');
    expect(previousWizardScreen('summary', all)).toBeNull();
  });

  test('back goes to the previous asked screen, and the first one has no back', () => {
    expect(previousWizardScreen('logistics', plan)).toBe('background');
    expect(previousWizardScreen('background', plan)).toBeNull();
    expect(previousWizardScreen('terms', plan)).toBe('summary');
  });

  test('the progress counts only the screens she sees', () => {
    expect(wizardScreenPosition('background', plan)).toEqual({ step: 1, total: 4 });
    expect(wizardScreenPosition('logistics', plan)).toEqual({ step: 2, total: 4 });
    expect(wizardScreenPosition('summary', plan)).toEqual({ step: 3, total: 4 });
    expect(wizardScreenPosition('terms', plan)).toEqual({ step: 4, total: 4 });
  });
});

describe('trimPayloadToAnswers', () => {
  const full = {
    first_name: 'Mariam',
    last_name: 'Keita',
    date_of_birth: '1999-03-14',
    place_of_birth: 'Bamako',
    nationality: 'Mali',
    preferred_language: 'ca',
    document_type: 'none',
    document_number: null,
    phone: null,
    address: null,
    city: 'Vic',
    postal_code: null,
    reference_entity: 'Creu Roja Osona',
    reference_contact_name: null,
    has_dependents: false,
    num_dependents: 0,
    clothing_size: 'M',
    shoe_size: '39',
    media_consent: false,
    terms_version: '2026-07-01',
    locale_shown: 'ca',
  };

  test('with nothing answered, everything is sent', () => {
    expect(trimPayloadToAnswers(full, answered(), {})).toEqual(full);
  });

  test('an answered question she left as stored is not sent, so the stored value stays', () => {
    const trimmed = trimPayloadToAnswers(full, answered('nationality', 'clothing_size'), {
      nationality: 'Mali',
      clothing_size: 'M',
    });
    expect(trimmed).not.toHaveProperty('nationality');
    expect(trimmed).not.toHaveProperty('clothing_size');
    expect(trimmed.shoe_size).toBe('39');
  });

  test('an answered question she changed on the summary is sent', () => {
    const trimmed = trimPayloadToAnswers(full, answered('nationality'), { nationality: 'Guinea' });
    expect(trimmed.nationality).toBe('Mali');
  });

  test('a two-field question travels whole', () => {
    const trimmed = trimPayloadToAnswers(full, answered('dependents', 'document'), {
      has_dependents: false,
      num_dependents: 2,
      document_type: 'none',
      document_number: null,
    });
    expect(trimmed).toMatchObject({ has_dependents: false, num_dependents: 0 });
    expect(trimmed).not.toHaveProperty('document_type');
    expect(trimmed).not.toHaveProperty('document_number');
  });

  test('consent and the terms context are always sent', () => {
    const trimmed = trimPayloadToAnswers(full, new Set(INTAKE_QUESTIONS), full);
    expect(Object.keys(trimmed).sort()).toEqual(['locale_shown', 'media_consent', 'terms_version']);
  });
});

describe('answeredQuestionsSchema', () => {
  test('keeps known questions and drops unknown ones from a newer server', () => {
    expect(answeredQuestionsSchema.parse(['nationality', 'favourite_colour', 'phone'])).toEqual([
      'nationality',
      'phone',
    ]);
  });
});
