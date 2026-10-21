import { describe, expect, test } from 'bun:test';
import { buildCreateParticipantInvitePayload } from '../schemas/accounts';
import { INTAKE_STATE_PRESETS, WIZARD_QUESTIONS } from './question-states';
import {
  allowedQuestionStates,
  answeredAtInvitation,
  fetchReferralAnswerKeys,
  previewWizardQuestions,
  wizardNotAsked,
} from './wizard-preview';

const invitation = (referenceEntity?: string) =>
  buildCreateParticipantInvitePayload({
    email: 'nova@example.test',
    firstName: 'Nova',
    lastName: 'Prova',
    referenceEntity,
  });

const asked = (rows: ReturnType<typeof previewWizardQuestions>) =>
  rows.filter((row) => row.isAsked).map((row) => row.question);

describe('what an invitation records as answered (RAPP-618)', () => {
  test('her names always; the entity only when staff typed one', () => {
    expect([...answeredAtInvitation(invitation())]).toEqual(['first_name', 'last_name']);
    expect([...answeredAtInvitation(invitation('Creu Roja'))]).toEqual([
      'first_name',
      'last_name',
      'reference_entity',
    ]);
  });

  test("the entity's answers count for the questions staff did not send", () => {
    const answered = answeredAtInvitation(invitation(), [
      'date_of_birth',
      'phone',
      'document_type',
      'document_number',
      // Staff sent the entity field (empty), so the entity's copy is dropped.
      'reference_entity',
    ]);
    expect(answered.has('date_of_birth')).toBe(true);
    expect(answered.has('phone')).toBe(true);
    expect(answered.has('document')).toBe(true);
    expect(answered.has('reference_entity')).toBe(false);
  });
});

describe('the preview staff confirm before inviting (RAPP-618)', () => {
  test('Auto: she is asked every question nobody answered', () => {
    const rows = previewWizardQuestions(answeredAtInvitation(invitation()), {});
    expect(rows.map((row) => row.question)).toEqual([...WIZARD_QUESTIONS]);
    expect(asked(rows)).toEqual(
      WIZARD_QUESTIONS.filter((question) => question !== 'first_name' && question !== 'last_name'),
    );
  });

  test('Ask and Don’t ask change single questions, as her phone will', () => {
    const answered = answeredAtInvitation(invitation());
    const rows = previewWizardQuestions(answered, { first_name: 'ask', phone: 'skip' });
    // The same case the database test checks through my_questions_to_ask().
    expect(asked(rows)).toEqual(
      WIZARD_QUESTIONS.filter((question) => question !== 'last_name' && question !== 'phone'),
    );
    expect(rows.find((row) => row.question === 'first_name')?.state).toBe('ask');
  });

  test('the review preset asks everything', () => {
    const rows = previewWizardQuestions(
      answeredAtInvitation(invitation('Creu Roja')),
      INTAKE_STATE_PRESETS.review,
    );
    expect(asked(rows)).toEqual([...WIZARD_QUESTIONS]);
  });

  test('Don’t ask is not allowed on an unanswered required question', () => {
    const answered = answeredAtInvitation(invitation());
    const rows = previewWizardQuestions(answered, {});
    expect(rows.find((row) => row.question === 'date_of_birth')?.canSkip).toBe(false);
    expect(rows.find((row) => row.question === 'first_name')?.canSkip).toBe(true);
    expect(rows.find((row) => row.question === 'phone')?.canSkip).toBe(true);
    expect(
      allowedQuestionStates({ date_of_birth: 'skip', phone: 'skip', last_name: 'ask' }, answered),
    ).toEqual({ phone: 'skip', last_name: 'ask' });
  });

  test('a question removed in Settings is never asked, as on her phone', () => {
    const answered = answeredAtInvitation(invitation());
    const rows = previewWizardQuestions(answered, { phone: 'ask' }, new Set(['phone']));
    const phone = rows.find((row) => row.question === 'phone');
    expect(phone?.isAsked).toBe(false);
    expect(phone?.isRemoved).toBe(true);
    expect(wizardNotAsked(new Set(['phone']), new Set(['phone'])).has('phone')).toBe(true);
  });
});

describe('fetchReferralAnswerKeys (RAPP-618)', () => {
  test('asks the database for the keys of one referral', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: ['phone', 'date_of_birth'], error: null };
      },
    } as unknown as Parameters<typeof fetchReferralAnswerKeys>[0];
    const referral = '5eed0000-0000-4000-8010-000000000001';
    expect(await fetchReferralAnswerKeys(client, referral)).toEqual(['phone', 'date_of_birth']);
    expect(calls).toEqual([['referral_answer_keys', { p_referral_id: referral }]]);
  });
});
