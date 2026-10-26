import { describe, expect, test } from 'bun:test';
import { decodeSupportNeeds, encodeSupportNeeds } from '../schemas/support-needs';
import {
  systemFieldFixtureId as fieldId,
  systemOptionFixtureId as optionId,
  systemFieldsCatalogFixture,
} from '../testing/system-fields';
import {
  appAnswersFromForm,
  appControlFits,
  appFieldIds,
  appFormToSend,
  appFormValues,
  supportNeedsAnswerParts,
} from './app-field-form';
import { systemFieldIndexFromCatalog } from './field-answers';

const index = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

describe('appFormValues', () => {
  test('reads each answer in the shape its control takes', () => {
    const values = appFormValues(index, {
      [fieldId('date_of_birth')]: '1990-03-07',
      [fieldId('nationality')]: 'Síria',
      [fieldId('document_type')]: optionId('document_type', 'nie'),
      [fieldId('document_number')]: 'X1234567L',
      [fieldId('has_dependents')]: optionId('has_dependents', 'yes'),
      [fieldId('num_dependents')]: 2,
      [fieldId('clothing_size')]: optionId('clothing_size', 'M'),
      [fieldId('supporting_entities')]: ['Creu Roja'],
      [fieldId('childcare_need')]: 'maybe',
      [fieldId('specific_needs')]: [optionId('specific_needs', 'health')],
      [fieldId('specific_needs_details')]: 'Asthma',
    });
    expect(values).toEqual({
      dateOfBirth: '1990-03-07',
      nationality: 'Síria',
      documentType: 'nie',
      documentNumber: 'X1234567L',
      hasDependents: true,
      numDependents: 2,
      clothingSize: 'M',
      supportingEntities: ['Creu Roja'],
      childcareNeed: 'maybe',
      specificNeeds: encodeSupportNeeds({
        categories: ['health'],
        details: {},
        explanation: 'Asthma',
      }),
    });
  });

  test('leaves out an answer whose field type the control cannot read', () => {
    const changed = systemFieldIndexFromCatalog({
      fields: systemFieldsCatalogFixture().fields.map((field) =>
        (field as { system_key: string }).system_key === 'date_of_birth'
          ? { ...(field as object), question_type: 'short_text' }
          : field,
      ),
    });
    expect(appFormValues(changed, { [fieldId('date_of_birth')]: 'when I was young' })).toEqual({});
  });

  test('a list or phone control stops asking a field staff turned into free text', () => {
    for (const [key, question] of [
      ['nationality', 'nationality'],
      ['phone', 'phone'],
      ['city', 'city'],
    ] as const) {
      const changed = systemFieldIndexFromCatalog({
        fields: systemFieldsCatalogFixture().fields.map((field) =>
          (field as { system_key: string }).system_key === key
            ? { ...(field as object), question_type: 'short_text' }
            : field,
        ),
      });
      expect(appControlFits(index, question)).toBe(true);
      expect(appControlFits(changed, question)).toBe(false);
    }
  });

  test('a need of none reads without its details', () => {
    const values = appFormValues(index, {
      [fieldId('specific_needs')]: [optionId('specific_needs', 'none')],
      [fieldId('specific_needs_details')]: 'kept by the team',
    });
    expect(decodeSupportNeeds(values.specificNeeds)).toEqual({ categories: ['none'], details: {} });
  });
});

describe('appAnswersFromForm', () => {
  test('writes each form value as its field answer, choices by option id', () => {
    expect(
      appAnswersFromForm(index, {
        dateOfBirth: '1990-03-07',
        documentType: 'passport',
        hasDependents: false,
        numDependents: 0,
        shoeSize: '38',
        applicantStatus: 'other',
        childcareNeed: 'no',
        phone: '',
      }),
    ).toEqual({
      [fieldId('date_of_birth')]: '1990-03-07',
      [fieldId('document_type')]: optionId('document_type', 'passport'),
      [fieldId('has_dependents')]: optionId('has_dependents', 'no'),
      [fieldId('num_dependents')]: null,
      [fieldId('shoe_size')]: optionId('shoe_size', '38'),
      [fieldId('applicant_status')]: optionId('applicant_status', 'other'),
      [fieldId('childcare_need')]: 'no',
      [fieldId('phone')]: null,
    });
  });

  test('her draft keeps an emptied answer and the count as she typed it', () => {
    expect(
      appAnswersFromForm(
        index,
        { placeOfBirth: '', numDependents: '2', clothingSize: '' },
        { asTyped: true },
      ),
    ).toEqual({
      [fieldId('place_of_birth')]: '',
      [fieldId('num_dependents')]: 2,
      [fieldId('clothing_size')]: '',
    });
  });

  test('a key no option has travels as it is, so the database refuses it', () => {
    expect(appAnswersFromForm(index, { clothingSize: 'XXXL' })).toEqual({
      [fieldId('clothing_size')]: 'XXXL',
    });
  });

  test('a list drops blanks and repeats', () => {
    expect(
      appAnswersFromForm(index, { supportingEntities: [' Creu Roja', 'Creu Roja', ''] }),
    ).toEqual({ [fieldId('supporting_entities')]: ['Creu Roja'] });
  });

  test('the needs become the needs field and one details text', () => {
    const value = encodeSupportNeeds({
      categories: ['health', 'other'],
      details: {},
      explanation: 'Asthma',
    });
    expect(appAnswersFromForm(index, { specificNeeds: value })).toEqual({
      [fieldId('specific_needs')]: [
        optionId('specific_needs', 'health'),
        optionId('specific_needs', 'other'),
      ],
      [fieldId('specific_needs_details')]: 'Asthma',
    });
    expect(appAnswersFromForm(index, { specificNeeds: '' })).toEqual({
      [fieldId('specific_needs')]: null,
      [fieldId('specific_needs_details')]: null,
    });
  });

  test('reading then writing gives back the same answers', () => {
    const answers = {
      [fieldId('date_of_birth')]: '1990-03-07',
      [fieldId('city')]: 'Vic',
      [fieldId('document_type')]: optionId('document_type', 'other'),
      [fieldId('document_name')]: 'Carta',
      [fieldId('has_dependents')]: optionId('has_dependents', 'yes'),
      [fieldId('num_dependents')]: 3,
      [fieldId('specific_needs')]: [optionId('specific_needs', 'wellbeing')],
      [fieldId('specific_needs_details')]: 'Quiet room',
    };
    expect(appAnswersFromForm(index, { ...appFormValues(index, answers) })).toEqual(answers);
  });
});

test('per category details of an older value join her explanation, named in Catalan', () => {
  const value = encodeSupportNeeds({
    categories: ['health', 'communication'],
    details: { health: 'Asthma', communication: 'Interpreter' },
  });
  expect(supportNeedsAnswerParts(index, value)).toEqual({
    needs: [optionId('specific_needs', 'health'), optionId('specific_needs', 'communication')],
    details: 'health: Asthma\n\ncommunication: Interpreter',
  });
  expect(supportNeedsAnswerParts(index, 'free text from before')).toEqual({
    needs: [optionId('specific_needs', 'other')],
    details: 'free text from before',
  });
});

test('appFieldIds lists every app field', () => {
  expect(appFieldIds(index).has(fieldId('specific_needs_details'))).toBe(true);
  expect(appFieldIds(index).size).toBe(index.size);
});

describe('appFormToSend', () => {
  test('a number travels only with a document that takes one, a name only for another', () => {
    expect(
      appFormToSend({ documentType: 'none', documentNumber: 'X1234567L', documentName: 'Carta' }, [
        'documentType',
        'documentNumber',
        'documentName',
      ]),
    ).toEqual({ documentType: 'none', documentNumber: null, documentName: null });
    // A skipped document sends no stray number.
    expect(appFormToSend({ documentNumber: 'X1234567L' }, ['documentNumber'])).toEqual({
      documentNumber: null,
    });
    expect(
      appFormToSend({ documentType: 'other', documentName: ' Carta ' }, ['documentName']),
    ).toEqual({ documentName: 'Carta' });
  });

  test('no count without dependants, no details without another status', () => {
    expect(
      appFormToSend(
        {
          hasDependents: false,
          numDependents: 2,
          applicantStatus: 'refugee',
          applicantStatusDetails: 'x',
        },
        ['numDependents', 'applicantStatusDetails'],
      ),
    ).toEqual({ numDependents: null, applicantStatusDetails: null });
  });

  test('her entity left out stays out, her "None" is null, an unanswered value is null', () => {
    expect(appFormToSend({}, ['referenceEntity', 'phone'])).toEqual({ phone: null });
    expect(appFormToSend({ referenceEntity: null }, ['referenceEntity'])).toEqual({
      referenceEntity: null,
    });
  });
});
