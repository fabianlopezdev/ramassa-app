/**
 * The participation authorization (RAPP-304): what she must sign, how a
 * signature is checked before it is sent, and the actions behind both apps.
 */
import { describe, expect, test } from 'bun:test';
import { buildAuthorizationVersion } from '../testing/factories';
import {
  AUTHORIZATION_CONSENTS,
  authorizationContentSchema,
  authorizationSigningSchema,
  buildSignPayload,
  fetchMyAuthorizationStatus,
  needsAuthorization,
  publishAuthorizationVersion,
  recordPaperAuthorization,
  setOptionalConsent,
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

const everyConsent = {
  participation: true,
  data_processing: true,
  code_of_conduct: true,
  health_data: true,
  image_rights: false,
  newsletter: false,
  messaging_groups: false,
};

describe('the consents', () => {
  test('four are required, three optional, in signing order', () => {
    expect(
      AUTHORIZATION_CONSENTS.filter((consent) => consent.required).map(({ key }) => key),
    ).toEqual(['participation', 'data_processing', 'code_of_conduct', 'health_data']);
    expect(AUTHORIZATION_CONSENTS).toHaveLength(7);
  });
});

describe('authorizationContentSchema', () => {
  test('reads a published version', () => {
    const content = authorizationContentSchema.parse(buildAuthorizationVersion().content);
    expect(content.sections[0]?.key).toBe('participation');
    expect(content.consents.health_data.required).toBe(true);
  });
});

describe('authorizationSigningSchema', () => {
  const valid = {
    consents: everyConsent,
    healthInfo: 'No',
    strokes: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
    unableToDraw: false,
  };

  test('accepts every required consent, the medical answer and a drawing', () => {
    expect(authorizationSigningSchema.safeParse(valid).success).toBe(true);
  });

  test('a missing required consent is refused', () => {
    expect(
      authorizationSigningSchema.safeParse({
        ...valid,
        consents: { ...everyConsent, health_data: false },
      }).success,
    ).toBe(false);
  });

  test('the medical answer is required, "No" included', () => {
    expect(authorizationSigningSchema.safeParse({ ...valid, healthInfo: ' ' }).success).toBe(false);
  });

  test('she signs with a drawing, or records that she could not draw', () => {
    expect(authorizationSigningSchema.safeParse({ ...valid, strokes: null }).success).toBe(false);
    expect(
      authorizationSigningSchema.safeParse({ ...valid, strokes: null, unableToDraw: true }).success,
    ).toBe(true);
  });
});

describe('buildSignPayload', () => {
  test('a drawing is not sent when she could not draw', () => {
    const payload = buildSignPayload(
      authorizationSigningSchema.parse({
        consents: everyConsent,
        healthInfo: 'No',
        strokes: null,
        unableToDraw: true,
        emergencyContact: { name: 'Olena', relation: 'Germana', phone: '' },
      }),
      { language: 'ca', device: 'iPhone' },
    );
    expect(payload).toMatchObject({
      health_info: 'No',
      unable_to_draw: true,
      signature: null,
      language: 'ca',
      device: 'iPhone',
      emergency_contact: { name: 'Olena', relation: 'Germana', phone: '' },
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
    expect(calls).toEqual([['my_authorization_status']]);
  });

  test('a failed read is a typed DB-1 error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'boom' } });
    await expect(fetchMyAuthorizationStatus(client)).rejects.toMatchObject({ code: 'DB-1' });
  });
});

describe('actions', () => {
  test('optional consents, paper records and publishing call their functions', async () => {
    const { client, calls } = clientReturning({ data: 'id', error: null });
    await setOptionalConsent(client, 'image_rights', false);
    await recordPaperAuthorization(client, 'p1', '2026-09-20');
    await publishAuthorizationVersion(
      client,
      authorizationContentSchema.parse(buildAuthorizationVersion().content),
    );
    expect(calls.map((call) => (call as unknown[])[0])).toEqual([
      'set_optional_consent',
      'record_paper_authorization',
      'publish_authorization_version',
    ]);
  });
});
