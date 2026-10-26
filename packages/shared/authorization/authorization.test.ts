/**
 * The participation authorization (RAPP-304), fully editable per version
 * (RAPP-614): what a version may hold, how a signature is checked against the
 * version it is signed on, the wording staff write with the app's text as the
 * fallback, and the actions behind both apps.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { buildAuthorizationVersion } from '../testing/factories';
import {
  AUTHORIZATION_BUNDLED_TEXT_KEYS,
  AUTHORIZATION_TEXT_FIELDS,
  authorizationContentSchema,
  authorizationScreenOrder,
  authorizationSigningSchemaFor,
  authorizationWording,
  buildSignPayload,
  discardAuthorizationDraft,
  fetchAuthorizationVersions,
  fetchMyAuthorizationStatus,
  fetchParticipantConsents,
  isMiddlePhaseShown,
  needsAuthorization,
  newConsentKey,
  orderedConsents,
  publishAuthorizationDraft,
  recordPaperAuthorization,
  saveAuthorizationDraft,
  setOptionalConsent,
  type AuthorizationContent,
} from './authorization';

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[] = [];
  const client = {
    rpc: (name: string, args?: unknown) => {
      calls.push(args === undefined ? [name] : [name, args]);
      return Promise.resolve(result);
    },
  };
  return { client: client as never, calls };
}

const version1 = (): AuthorizationContent =>
  authorizationContentSchema.parse(buildAuthorizationVersion().content);

/** Version 1 with a staff consent, health optional, the contact required and sensitive. */
function version2(): AuthorizationContent {
  const content = version1();
  const consents = Object.fromEntries(
    Object.entries(content.consents).filter(([key]) => key !== 'newsletter'),
  );
  return {
    ...content,
    consents: {
      ...consents,
      health_data: { ...consents.health_data!, required: false },
      team_photos: { label: { ca: 'Fotos d’equip' }, required: true, position: 9 },
    },
    questions: {
      health: { ...content.questions.health, required: false },
      emergency_contact: { asked: true, required: true, privacy: 'sensitive', texts: {} },
    },
    texts: { sign_and_enter_label: { ca: 'Signa i juga' } },
  };
}

const requiredOf1 = {
  participation: true,
  data_processing: true,
  code_of_conduct: true,
  health_data: true,
};
const drawing = [
  [
    [1, 2],
    [3, 4],
  ],
];

describe('a version', () => {
  test('reads a published version in signing order', () => {
    const content = version1();
    expect(orderedConsents(content).map((consent) => consent.key)).toEqual([
      'participation',
      'data_processing',
      'code_of_conduct',
      'health_data',
      'image_rights',
      'newsletter',
      'messaging_groups',
    ]);
    expect(content.questions.health).toMatchObject({ asked: true, required: true });
  });

  test('image rights are never required: they drive the photo consent she can refuse', () => {
    const content = version1();
    expect(
      authorizationContentSchema.safeParse({
        ...content,
        consents: {
          ...content.consents,
          image_rights: { ...content.consents.image_rights!, required: true },
        },
      }).success,
    ).toBe(false);
  });

  test('asking her health needs the health data consent, required with the question', () => {
    const content = version1();
    const withoutHealth = Object.fromEntries(
      Object.entries(content.consents).filter(([key]) => key !== 'health_data'),
    );
    expect(
      authorizationContentSchema.safeParse({ ...content, consents: withoutHealth }).success,
    ).toBe(false);
    expect(
      authorizationContentSchema.safeParse({
        ...content,
        consents: {
          ...content.consents,
          health_data: { ...content.consents.health_data!, required: false },
        },
      }).success,
    ).toBe(false);
    expect(authorizationContentSchema.safeParse(version2()).success).toBe(true);
  });

  test('a hidden question is never required, and the middle phase hides with both', () => {
    const content = version1();
    expect(
      authorizationContentSchema.safeParse({
        ...content,
        questions: {
          ...content.questions,
          emergency_contact: { asked: false, required: true, privacy: 'personal', texts: {} },
        },
      }).success,
    ).toBe(false);
    const hidden = authorizationContentSchema.parse({
      ...content,
      questions: {
        health: { asked: false, required: false, privacy: 'health', texts: {} },
        emergency_contact: { asked: false, required: false, privacy: 'personal', texts: {} },
      },
    });
    expect(isMiddlePhaseShown(hidden)).toBe(false);
    expect(isMiddlePhaseShown(content)).toBe(true);
  });

  test('consent keys are lowercase letters, digits and underscores, and places are unique', () => {
    const content = version1();
    expect(
      authorizationContentSchema.safeParse({
        ...content,
        consents: { ...content.consents, 'Bad Key': content.consents.newsletter },
      }).success,
    ).toBe(false);
    expect(
      authorizationContentSchema.safeParse({
        ...content,
        consents: {
          ...content.consents,
          newsletter: { ...content.consents.newsletter!, position: 0 },
        },
      }).success,
    ).toBe(false);
  });

  test('only the listed wording fields; validation messages stay in the app', () => {
    expect(
      authorizationContentSchema.safeParse({ ...version1(), texts: { error_message: { ca: 'x' } } })
        .success,
    ).toBe(false);
  });

  test('a new consent gets a key no consent of the version uses', () => {
    const content = version1();
    const key = newConsentKey(content);
    expect(key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    expect(Object.keys(content.consents)).not.toContain(key);
  });
});

describe('the wording', () => {
  test('staff text in her language, else the app text in her language', () => {
    const texts = version2().texts;
    expect(authorizationWording(texts, 'sign_and_enter_label', 'ca')).toBe('Signa i juga');
    expect(authorizationWording(texts, 'sign_and_enter_label', 'ar')).toBeUndefined();
    expect(authorizationWording(texts, 'intro', 'ca')).toBeUndefined();
  });

  test('every field has the app text it falls back to', () => {
    for (const field of AUTHORIZATION_TEXT_FIELDS.texts) {
      expect(AUTHORIZATION_BUNDLED_TEXT_KEYS.texts[field]).toBeString();
    }
    expect(Object.keys(AUTHORIZATION_BUNDLED_TEXT_KEYS.health).sort()).toEqual(
      [...AUTHORIZATION_TEXT_FIELDS.health].sort(),
    );
    expect(Object.keys(AUTHORIZATION_BUNDLED_TEXT_KEYS.emergency_contact).sort()).toEqual(
      [...AUTHORIZATION_TEXT_FIELDS.emergency_contact].sort(),
    );
  });

  test('the database lists the same fields', () => {
    const migrations = resolve(import.meta.dir, '../../../supabase/migrations');
    const sql = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(resolve(migrations, name), 'utf8'))
      .filter((text) => text.includes('-- authorization-text-fields:start'))
      .at(-1)!;
    const block = sql.slice(
      sql.indexOf('-- authorization-text-fields:start'),
      sql.indexOf('-- authorization-text-fields:end'),
    );
    for (const [part, fields] of Object.entries(AUTHORIZATION_TEXT_FIELDS)) {
      const row = block.split('\n').find((line) => line.includes(`('${part}', array[`))!;
      expect(
        row
          .match(/'([a-z_]+)'/g)!
          .slice(1)
          .map((value) => value.slice(1, -1)),
      ).toEqual([...fields]);
    }
  });
});

describe('signing against the version', () => {
  test('she signs with only the required consents; the optional ones may stay untouched', () => {
    const schema = authorizationSigningSchemaFor(version1());
    expect(
      schema.safeParse({
        consents: requiredOf1,
        healthInfo: 'No',
        strokes: drawing,
        unableToDraw: false,
      }).success,
    ).toBe(true);
  });

  test('a required consent staff added must be ticked', () => {
    const schema = authorizationSigningSchemaFor(version2());
    const base = {
      consents: { participation: true, data_processing: true, code_of_conduct: true },
      healthInfo: '',
      emergencyContact: { name: 'Olena', relation: '', phone: '600' },
      strokes: null,
      unableToDraw: true,
    };
    const refused = schema.safeParse(base);
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.path).toEqual(['consents', 'team_photos']);
    expect(
      schema.safeParse({ ...base, consents: { ...base.consents, team_photos: true } }).success,
    ).toBe(true);
  });

  test('the medical answer follows the question: required, optional, or not asked', () => {
    expect(
      authorizationSigningSchemaFor(version1()).safeParse({
        consents: requiredOf1,
        healthInfo: ' ',
        strokes: drawing,
        unableToDraw: false,
      }).success,
    ).toBe(false);
    const optional = authorizationSigningSchemaFor(version2());
    const answer = {
      consents: {
        participation: true,
        data_processing: true,
        code_of_conduct: true,
        team_photos: true,
      },
      healthInfo: 'Asma',
      emergencyContact: { name: 'Olena', relation: '', phone: '600' },
      strokes: null,
      unableToDraw: true,
    };
    const refused = optional.safeParse(answer);
    expect(refused.error?.issues[0]?.path).toEqual(['consents', 'health_data']);
    expect(
      optional.safeParse({ ...answer, consents: { ...answer.consents, health_data: true } })
        .success,
    ).toBe(true);
  });

  test('a required emergency contact needs a name and a phone', () => {
    const schema = authorizationSigningSchemaFor(version2());
    const result = schema.safeParse({
      consents: {
        participation: true,
        data_processing: true,
        code_of_conduct: true,
        team_photos: true,
      },
      healthInfo: '',
      emergencyContact: { name: 'Olena', relation: '', phone: '' },
      strokes: null,
      unableToDraw: true,
    });
    expect(result.error?.issues[0]?.path).toEqual(['emergencyContact']);
  });

  test('she signs with a drawing, or records that she could not draw', () => {
    const schema = authorizationSigningSchemaFor(version1());
    const signing = { consents: requiredOf1, healthInfo: 'No', strokes: null, unableToDraw: false };
    expect(schema.safeParse(signing).success).toBe(false);
    expect(schema.safeParse({ ...signing, unableToDraw: true }).success).toBe(true);
  });

  test('the payload names every consent of the version and only those', () => {
    const content = version2();
    const payload = buildSignPayload(
      authorizationSigningSchemaFor(content).parse({
        consents: {
          participation: true,
          data_processing: true,
          code_of_conduct: true,
          team_photos: true,
        },
        healthInfo: '',
        emergencyContact: { name: 'Olena', relation: 'Germana', phone: '600' },
        strokes: null,
        unableToDraw: true,
      }),
      { language: 'ca', device: 'iPhone' },
      content,
    ) as Record<string, unknown>;
    expect(payload.consents).toEqual({
      participation: true,
      data_processing: true,
      code_of_conduct: true,
      health_data: false,
      image_rights: false,
      messaging_groups: false,
      team_photos: true,
    });
    expect(payload).toMatchObject({
      health_info: null,
      unable_to_draw: true,
      signature: null,
      language: 'ca',
      emergency_contact: { name: 'Olena', relation: 'Germana', phone: '600' },
    });
  });
});

describe('the gate', () => {
  test('no published version means nothing to sign', async () => {
    const { client } = clientReturning({ data: [], error: null });
    const status = await fetchMyAuthorizationStatus(client);
    expect(status).toBeNull();
    expect(needsAuthorization(status)).toBe(false);
  });

  test('a required status carries the version to sign', async () => {
    const version = buildAuthorizationVersion();
    const { client, calls } = clientReturning({
      data: [
        {
          required: true,
          version_id: version.id,
          season_id: version.season_id,
          season_name: '2026/27',
          version_number: 1,
          content: version.content,
        },
      ],
      error: null,
    });
    const status = await fetchMyAuthorizationStatus(client);
    expect(needsAuthorization(status)).toBe(true);
    expect(status?.seasonName).toBe('2026/27');
    expect(status?.isDraft).toBe(false);
    expect(calls).toEqual([['my_authorization_status']]);
  });

  test('a test player is asked to sign the draft, with no number (RAPP-619)', async () => {
    const version = buildAuthorizationVersion();
    const { client } = clientReturning({
      data: [
        {
          required: true,
          version_id: '5eed0000-0000-4000-8041-000000000009',
          season_id: version.season_id,
          season_name: '2026/27',
          version_number: null,
          content: version.content,
          is_returning: false,
          is_draft: true,
        },
      ],
      error: null,
    });
    const status = await fetchMyAuthorizationStatus(client);
    expect(status?.isDraft).toBe(true);
    expect(status?.versionNumber).toBeNull();
    expect(needsAuthorization(status)).toBe(true);
  });

  test('a failed read is a typed DB-1 error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchMyAuthorizationStatus(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});

describe('staff', () => {
  test('the versions list carries the draft, with no season or number yet', async () => {
    const version = buildAuthorizationVersion();
    const { client } = clientReturning({
      data: [
        {
          id: '5eed0000-0000-4000-8041-000000000002',
          season_id: null,
          season_name: null,
          version_number: null,
          content: version.content,
          published_at: null,
          is_current: false,
          updated_at: '2026-10-22T10:00:00Z',
        },
        {
          id: version.id,
          season_id: version.season_id,
          season_name: '2026/27',
          version_number: 1,
          content: version.content,
          published_at: '2026-09-01T09:00:00Z',
          is_current: true,
          updated_at: '2026-09-01T09:00:00Z',
        },
      ],
      error: null,
    });
    const versions = await fetchAuthorizationVersions(client);
    expect(versions.map((row) => row.versionNumber)).toEqual([null, 1]);
    expect(versions.map((row) => row.seasonId)).toEqual([null, version.season_id]);
    expect(versions[0]?.publishedAt).toBeNull();
  });

  test('her consents read with the words she was shown, a staff consent included', async () => {
    const { client } = clientReturning({
      data: [
        {
          consent_key: 'team_photos',
          granted: true,
          decided_at: '2026-10-22T10:00:00Z',
          method: 'app',
          wording: 'أوافق على صور الفريق',
          language: 'ar',
          required: true,
          season_name: '2026/27',
          version_number: 2,
        },
        {
          consent_key: 'image_rights',
          granted: false,
          decided_at: '2026-10-22T10:00:00Z',
          method: 'profile',
          wording: null,
          language: null,
          required: null,
          season_name: null,
          version_number: null,
        },
      ],
      error: null,
    });
    const consents = await fetchParticipantConsents(client, 'p1');
    expect(consents[0]).toMatchObject({
      key: 'team_photos',
      wording: 'أوافق على صور الفريق',
      versionNumber: 2,
    });
    expect(consents[1]?.wording).toBeNull();
  });

  test('drafts, publishing, optional consents and paper records call their functions', async () => {
    const { client, calls } = clientReturning({ data: 'id', error: null });
    await setOptionalConsent(client, 'image_rights', false, 'ar');
    await recordPaperAuthorization(client, 'p1', '2026-09-20');
    await saveAuthorizationDraft(client, version1());
    await discardAuthorizationDraft(client);
    expect(calls.map((call) => (call as unknown[])[0])).toEqual([
      'set_optional_consent',
      'record_paper_authorization',
      'save_authorization_draft',
      'discard_authorization_draft',
    ]);
    expect((calls[0] as unknown[])[1]).toEqual({
      p_key: 'image_rights',
      p_granted: false,
      p_language: 'ar',
    });
    const published = clientReturning({ data: 2, error: null });
    expect(await publishAuthorizationDraft(published.client)).toBe(2);
    expect(published.calls).toEqual([
      ['publish_authorization_draft', { p_is_correction: false }],
    ]);
  });

  test('a draft is published to a chosen season (RAPP-694)', async () => {
    const published = clientReturning({ data: 1, error: null });
    expect(await publishAuthorizationDraft(published.client, 'season-2027')).toBe(1);
    expect(published.calls).toEqual([
      ['publish_authorization_draft', { p_season_id: 'season-2027', p_is_correction: false }],
    ]);
  });

  test('a correction is published as one (RAPP-696)', async () => {
    const published = clientReturning({ data: 2, error: null });
    expect(await publishAuthorizationDraft(published.client, null, 'correction')).toBe(2);
    expect(published.calls).toEqual([['publish_authorization_draft', { p_is_correction: true }]]);
  });

  test('the form walks its screens in the stored order, the signature last (RAPP-696)', () => {
    expect(authorizationScreenOrder({})).toEqual(['document', 'health', 'consents']);
    expect(authorizationScreenOrder({ screen_order: ['health', 'document'] })).toEqual([
      'health',
      'document',
      'consents',
    ]);
    expect(
      authorizationContentSchema.safeParse({ ...version1(), screen_order: ['health', 'health'] })
        .success,
    ).toBe(false);
  });
});
