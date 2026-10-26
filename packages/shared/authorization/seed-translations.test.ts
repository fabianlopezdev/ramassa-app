import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { resolveLocalizedText, SUPPORTED_LANGUAGES } from '../i18n';
import { authorizationContentSchema, orderedConsents } from './authorization';

const seed = readFileSync(`${import.meta.dir}/../../../supabase/seed.sql`, 'utf8');
const raw = seed.match(/\$auth\$([\s\S]*?)\$auth\$/)?.[1];
const content = authorizationContentSchema.parse(JSON.parse(raw ?? 'null'));

test('season authorization has all five languages without fallback in every published field', () => {
  const texts = [
    content.title,
    ...content.sections.flatMap((s) => [s.title, s.body]),
    ...Object.values(content.consents).map((c) => c.label),
    ...content.attachments.map((a) => a.label),
  ];
  expect(content.sections).toHaveLength(9);
  for (const language of SUPPORTED_LANGUAGES) {
    for (const text of texts) {
      expect(text[language]?.trim().length).toBeGreaterThan(0);
      expect(resolveLocalizedText(text, language)?.text).toBe(text[language]);
    }
    content.sections.forEach((section, index) =>
      expect(section.title[language]).toStartWith(`${index + 1}. `),
    );
    for (const section of content.sections) {
      const body = section.body[language]!;
      const source = section.body.es!;
      expect(body.split('\n\n').length).toBe(source.split('\n\n').length);
      expect(body.match(/•/gu)?.length ?? 0).toBe(source.match(/•/gu)?.length ?? 0);
      for (const address of source.match(/[a-z]+\[at\]example\.test/gu) ?? []) {
        expect(body).toContain(address);
      }
    }
    expect(content.sections.find((s) => s.key === 'data_processing')?.body[language]).toContain(
      '2016/679',
    );
    expect(content.sections.find((s) => s.key === 'images')?.body[language]).toContain('1/1982');
    expect(content.sections.find((s) => s.key === 'report')?.body[language]).toContain('112');
  }
  // The seeded version 1, converted to the editable shape (RAPP-614): the
  // RAPP-304 order and flags, both questions asked, no wording override.
  expect(orderedConsents(content).map(({ key, required }) => `${key}:${required}`)).toEqual([
    'participation:true',
    'data_processing:true',
    'code_of_conduct:true',
    'health_data:true',
    'image_rights:false',
    'newsletter:false',
    'messaging_groups:false',
  ]);
  expect(content.questions?.health.required).toBe(true);
  expect(content.texts).toEqual({});
  expect(content.attachments).toEqual([]);
});
