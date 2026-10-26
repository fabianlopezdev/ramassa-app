import { describe, expect, test } from 'bun:test';
import { authorizationContentSchema } from '../authorization';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { questionSettingsSchema } from '../intake-builder/question-types';
import {
  buildAnnouncement,
  buildAppAnswersFromFixture,
  buildAppTermsSignature,
  buildAttendance,
  buildAuditLogEntry,
  buildAuthorizationConsentEvent,
  buildAuthorizationSignature,
  buildAuthorizationVersion,
  buildCustomAnswer,
  buildCustomQuestionOption,
  buildCustomQuestionState,
  buildEquipmentDelivery,
  buildEvent,
  buildEventCategory,
  buildEventOccurrence,
  buildEventSignup,
  buildFieldPlacement,
  buildForumCategory,
  buildForumFlag,
  buildForumPost,
  buildForumReply,
  buildIntakeBuiltinScreen,
  buildIntakeFlowOrder,
  buildIntakeScreen,
  buildIntakeStatePreset,
  buildInvite,
  buildKnowledgeArticle,
  buildKnowledgeCategory,
  buildMentoringRequest,
  buildOnboardingDesigner,
  buildOrganization,
  buildParticipant,
  buildParticipantNote,
  buildParticipants,
  buildParticipantStory,
  buildProfile,
  buildProfileField,
  buildPushToken,
  buildReferralCustomAnswer,
  buildSeason,
  buildService,
  buildServiceCategory,
  buildServiceImage,
  buildServiceInterest,
  buildStockAlert,
  buildTestPlayer,
  buildTypedProfileField,
  buildWalkInSigning,
  SEED_CUSTOM_QUESTION_ID,
} from './factories';
import {
  INVITED_ACCOUNT_ID,
  ONBOARDING_ACCOUNT_EMAIL,
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  SEED_ORGANIZATION_ID,
  seedUserId,
  STAFF_FIXTURES,
  TEST_PLAYER_ID,
} from './fixtures';

describe('fixtures — the roster the seed and the factories share', () => {
  /** `@example.test` is reserved (RFC 2606); anything else would be a real address in test data. */
  test('every fixture email is under the reserved, unroutable fixture domain', () => {
    for (const fixture of [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES]) {
      expect(fixture.email.endsWith('@example.test')).toBe(true);
    }
  });

  test('the participant roster spans all five supported languages', () => {
    const languages = new Set(PARTICIPANT_FIXTURES.map((fixture) => fixture.preferredLanguage));
    for (const language of SUPPORTED_LANGUAGES) {
      expect(languages.has(language)).toBe(true);
    }
  });

  test('the RTL languages are carried by names in their own script, not transliterations', () => {
    const arabicScript = /[؀-ۿ]/;
    const rtlFixtures = PARTICIPANT_FIXTURES.filter(
      (fixture) => fixture.preferredLanguage === 'ar' || fixture.preferredLanguage === 'fa',
    );

    expect(rtlFixtures.length).toBeGreaterThan(0);
    for (const fixture of rtlFixtures) {
      expect(arabicScript.test(fixture.firstName)).toBe(true);
      expect(arabicScript.test(fixture.lastName)).toBe(true);
    }
  });

  test('the roster also carries a Cyrillic name (Ukrainian participants, no Ukrainian UI locale)', () => {
    const cyrillic = /[Ѐ-ӿ]/;
    expect(PARTICIPANT_FIXTURES.some((fixture) => cyrillic.test(fixture.firstName))).toBe(true);
  });

  test('every fixture ordinal is unique, so the derived user IDs cannot collide', () => {
    const ordinals = [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES].map((fixture) => fixture.ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length);
  });

  test('seedUserId derives a stable, seed-namespaced UUID from an ordinal', () => {
    expect(seedUserId(1)).toBe('5eed0000-0000-4000-8000-000000000001');
    expect(seedUserId(11)).toBe('5eed0000-0000-4000-8000-000000000011');
    expect(seedUserId(11)).toBe(seedUserId(11));
  });

  test('the shared dev password satisfies the app password rule', () => {
    expect(SEED_ACCOUNT_PASSWORD.length).toBeGreaterThanOrEqual(8);
  });
});

describe('buildOrganization', () => {
  test('defaults to the seeded tenant with all five languages available', () => {
    const organization = buildOrganization();

    expect(organization.id).toBe(SEED_ORGANIZATION_ID);
    expect(organization.available_languages).toEqual([...SUPPORTED_LANGUAGES]);
    expect(organization.default_language).toBe('ca');
  });

  test('overrides win over the defaults', () => {
    expect(buildOrganization({ slug: 'other-club' }).slug).toBe('other-club');
  });
});

describe('buildAnnouncement', () => {
  test('defaults to a complete, currently visible multilingual announcement', () => {
    const announcement = buildAnnouncement();

    expect(announcement.org_id).toBe(SEED_ORGANIZATION_ID);
    expect(announcement.status).toBe('published');
    expect(Object.keys(announcement.title as Record<string, unknown>)).toEqual([
      ...SUPPORTED_LANGUAGES,
    ]);
    expect(Object.keys(announcement.body as Record<string, unknown>)).toEqual([
      ...SUPPORTED_LANGUAGES,
    ]);
    expect(announcement.published_at).toBe('2026-01-15T09:00:00+00:00');
    expect(announcement.expires_at).toBeNull();
  });

  test('overrides win over defaults', () => {
    expect(buildAnnouncement({ status: 'draft', is_pinned: true })).toMatchObject({
      status: 'draft',
      is_pinned: true,
    });
  });
});

describe('service factories', () => {
  test('builds a published hybrid service from the seeded housing definition', () => {
    const category = buildServiceCategory();
    const service = buildService();

    expect(category.slug).toBe('housing');
    expect((category.metadata_schema as { fields: unknown[] }).fields.length).toBeGreaterThan(0);
    expect(service.category_id).toBe(category.id);
    expect(service.metadata).toMatchObject({
      housing_type: 'shared_flat',
      for_whom: 'women_only',
    });
    expect(service.status).toBe('published');
  });

  test('links image and interest fixtures to seeded service rows', () => {
    expect(buildServiceImage().service_id).toBe(buildService().id);
    expect(buildServiceImage().position).toBe(0);
    expect(buildServiceInterest().user_id).toBe(seedUserId(PARTICIPANT_FIXTURES[1]!.ordinal));
  });
});

describe('event factories', () => {
  test('builds a multilingual category from the fixed design vocabulary', () => {
    const category = buildEventCategory();

    expect(category.org_id).toBe(SEED_ORGANIZATION_ID);
    expect(Object.keys(category.name as Record<string, unknown>)).toEqual([...SUPPORTED_LANGUAGES]);
    expect(category.icon).toBe('dumbbell');
    expect(category.color).toBe('primary');
  });

  test('links a complete event and occurrence through deterministic IDs', () => {
    const event = buildEvent();
    const occurrence = buildEventOccurrence();

    expect(event.category_id).toBe(buildEventCategory().id);
    expect(event.created_by).toBe(seedUserId(STAFF_FIXTURES[1]!.ordinal));
    expect(occurrence.event_id).toBe(event.id);
    expect(occurrence.org_id).toBe(event.org_id);
  });

  test('event factory overrides win over generated and nullable defaults', () => {
    expect(buildEvent({ recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=6' })).toMatchObject({
      recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=6',
    });
    expect(buildEventOccurrence({ ends_at: null }).ends_at).toBeNull();
  });

  test('builds a deterministic signup linked to a seeded player and event', () => {
    const signup = buildEventSignup();

    expect(signup.event_id).toBe(buildEvent().id);
    expect(signup.player_id).toBe(seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal));
    expect(signup.state).toBe('confirmed');
  });

  test('builds a deterministic attendance mark linked to an occurrence, player, and coach', () => {
    const attendance = buildAttendance();

    expect(attendance.occurrence_id).toBe(buildEventOccurrence().id);
    expect(attendance.player_id).toBe(seedUserId(PARTICIPANT_FIXTURES[0]!.ordinal));
    expect(attendance.marked_by).toBe(seedUserId(STAFF_FIXTURES[1]!.ordinal));
    expect(attendance.status).toBe('present');
  });
});

describe('forum factories', () => {
  test('builds localized categories and first-name-only attributed threads', () => {
    const category = buildForumCategory();
    const flag = buildForumFlag();
    const post = buildForumPost();
    const reply = buildForumReply();

    expect(Object.keys(category.name as Record<string, unknown>)).toEqual([...SUPPORTED_LANGUAGES]);
    expect(post.category_id).toBe(category.id);
    expect(post.author_first_name).toBe(buildParticipant().first_name);
    expect(flag.post_id).toBe(post.id);
    expect(flag.flagger_id).toBe(seedUserId(PARTICIPANT_FIXTURES[1]!.ordinal));
    expect(flag.state).toBe('pending');
    expect(reply.post_id).toBe(post.id);
    expect(reply.author_first_name).toBe(PARTICIPANT_FIXTURES[1]!.firstName);
  });
});

describe('knowledge factories', () => {
  test('builds a complete published article linked to a deterministic category', () => {
    const category = buildKnowledgeCategory();
    const article = buildKnowledgeArticle();

    expect(article.category_id).toBe(category.id);
    expect(article.is_published).toBe(true);
    expect(Object.keys(article.title as Record<string, unknown>)).toEqual([...SUPPORTED_LANGUAGES]);
    expect(Object.keys(article.body as Record<string, unknown>)).toEqual([...SUPPORTED_LANGUAGES]);
  });

  test('builds an unpublished participant story with first-name-only attribution', () => {
    const story = buildParticipantStory();

    expect(story.content_type).toBe('participant_story');
    expect(story.story_status).toBe('submitted');
    expect(story.author_id).toBe(buildParticipant().id);
    expect(story.author_first_name).toBe(buildParticipant().first_name);
    expect(story.is_published).toBe(false);
  });
});

describe('buildProfile', () => {
  test('defaults to an active player in the seeded org', () => {
    const profile = buildProfile();

    expect(profile.role).toBe('player');
    expect(profile.org_id).toBe(SEED_ORGANIZATION_ID);
    expect(profile.is_active).toBe(true);
  });

  test('builds any role through overrides', () => {
    expect(buildProfile({ role: 'staff' }).role).toBe('staff');
  });

  test('is deterministic: two calls with no overrides are identical', () => {
    expect(buildProfile()).toEqual(buildProfile());
  });
});

describe('buildParticipant', () => {
  test('defaults to the first roster fixture, name in its own script', () => {
    const participant = buildParticipant();
    const firstFixture = PARTICIPANT_FIXTURES[0]!;

    expect(participant.first_name).toBe(firstFixture.firstName);
    expect(participant.preferred_language).toBe(firstFixture.preferredLanguage);
    expect(participant.id).toBe(seedUserId(firstFixture.ordinal));
    expect(participant.role).toBe('player');
  });

  test('overrides win over the fixture', () => {
    expect(buildParticipant({ preferred_language: 'es' }).preferred_language).toBe('es');
  });

  test('her profile holds her names and her account settings only (ADR-031)', () => {
    const participant = buildParticipant();
    for (const key of ['nationality', 'city', 'phone', 'date_of_birth', 'document_type']) {
      expect(participant).not.toHaveProperty(key);
    }
  });
});

describe('buildAppAnswersFromFixture', () => {
  test('her answers by system key, a choice by its option key, as the seed writes them', () => {
    const answers = buildAppAnswersFromFixture(PARTICIPANT_FIXTURES[0]!);
    expect(answers.nationality).toBe(PARTICIPANT_FIXTURES[0]!.nationality);
    expect(answers.city).toBe(PARTICIPANT_FIXTURES[0]!.city);
    expect(answers.document_type).toBe('nie');
    expect(answers.phone).toMatch(/^\+346\d{8}$/);
    expect(['yes', 'no']).toContain(String(answers.has_dependents));
  });

  test('an answer she never gave is left out', () => {
    const noDocument = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal % 5 === 0)!;
    const answers = buildAppAnswersFromFixture(noDocument);
    expect(answers.document_type).toBe('none');
    expect(answers).not.toHaveProperty('document_number');
  });
});

describe('buildParticipants', () => {
  test('walks the roster so a set of participants is multilingual by construction', () => {
    const participants = buildParticipants(6);

    expect(participants).toHaveLength(6);
    expect(new Set(participants.map((participant) => participant.id)).size).toBe(6);
    expect(
      new Set(participants.map((participant) => participant.preferred_language)).size,
    ).toBeGreaterThan(1);
  });

  test('IDs stay unique past the end of the roster', () => {
    const participants = buildParticipants(PARTICIPANT_FIXTURES.length + 3);

    expect(new Set(participants.map((participant) => participant.id)).size).toBe(
      participants.length,
    );
  });
});

describe('buildPushToken', () => {
  test('defaults to a token owned by the default participant', () => {
    expect(buildPushToken().user_id).toBe(buildParticipant().id);
  });

  test('overrides win over the defaults', () => {
    expect(buildPushToken({ platform: 'ios' }).platform).toBe('ios');
  });
});

describe('buildMentoringRequest', () => {
  test('defaults to a scheduled request owned by a seeded participant', () => {
    const request = buildMentoringRequest();

    expect(request.player_id).toBe(buildParticipant().id);
    expect(request.status).toBe('scheduled');
    expect(request.assigned_staff_id).not.toBeNull();
  });

  test('overrides win over the defaults', () => {
    expect(buildMentoringRequest({ status: 'requested', scheduled_at: null }).status).toBe(
      'requested',
    );
  });
});

describe('buildParticipantNote', () => {
  test('a note is about a participant and written BY somebody', () => {
    const note = buildParticipantNote();

    expect(note.profile_id).toBe(buildParticipant().id);
    expect(note.author_id).toBe(seedUserId(STAFF_FIXTURES[1]!.ordinal));
    expect(note.author_id).not.toBe(note.profile_id);
  });

  test('overrides win over the defaults', () => {
    expect(buildParticipantNote({ body: 'una altra cosa' }).body).toBe('una altra cosa');
  });
});

describe('buildAuditLogEntry', () => {
  test('defaults to the entry the detail screen produces most: a view, changing nothing', () => {
    const entry = buildAuditLogEntry();

    expect(entry.action).toBe('profile.view_sensitive');
    expect(entry.target_type).toBe('profile');
    expect(entry.target_id).toBe(buildParticipant().id);
    // A view changed nothing, so a diff would be a lie the first reader of this
    // table believes.
    expect(entry.changes).toBeNull();
  });

  test('the actor is a staff member, never the participant whose record it is', () => {
    const entry = buildAuditLogEntry();

    expect(entry.actor_id).toBe(seedUserId(STAFF_FIXTURES[1]!.ordinal));
    expect(entry.actor_id).not.toBe(entry.target_id);
  });

  test('an edit entry carries what changed', () => {
    const entry = buildAuditLogEntry({
      action: 'profile.update',
      changes: { city: { old: 'Vic', new: 'Manlleu' }, phone: { changed: true } },
    });

    expect(entry.changes).toEqual({
      city: { old: 'Vic', new: 'Manlleu' },
      phone: { changed: true },
    });
  });
});

describe('buildInvite', () => {
  test('defaults to PENDING, which is the state the wizard actually reads', () => {
    const invite = buildInvite();

    expect(invite.accepted_at).toBeNull();
    expect(invite.accepted_by).toBeNull();
    expect(invite.reference_entity).toBe('Creu Roja Osona');
  });

  test('is addressed to the account that has an identity but no profile yet', () => {
    // A freshly invited woman is signed in and has nothing else. That is the
    // only state in which the prefill has any work to do.
    expect(buildInvite().email).toBe(ONBOARDING_ACCOUNT_EMAIL);
  });

  test('is sent BY a staff member, never by the participant herself', () => {
    const invite = buildInvite();

    expect(invite.invited_by).toBe(seedUserId(STAFF_FIXTURES[1]!.ordinal));
    expect(invite.invited_by).not.toBe(invite.accepted_by);
  });
});

describe('buildEquipmentDelivery', () => {
  test('is a signed handover, the state the phone always saves', () => {
    // The database refuses "signed" without strokes; a factory that broke the
    // rule would let a screen pass tests on a record that cannot exist.
    const delivery = buildEquipmentDelivery();

    expect(delivery.signature_state).toBe('signed');
    expect(delivery.signature).not.toBeNull();
    expect(delivery.signature_reason).toBeNull();
  });
});

describe('buildStockAlert', () => {
  test('defaults to open, which is what Today shows', () => {
    expect(buildStockAlert().resolved_at).toBeNull();
    expect(buildStockAlert().org_id).toBe(SEED_ORGANIZATION_ID);
  });
});

describe('the authorization factories (RAPP-304)', () => {
  test('a current season, a version with every consent, a paper record, a consent', () => {
    expect(buildSeason().is_current).toBe(true);
    const version = buildAuthorizationVersion();
    expect(Object.keys((version.content as { consents: object }).consents)).toHaveLength(7);
    const paper = buildAuthorizationSignature();
    expect(paper.method).toBe('paper');
    expect(paper.signature).toBeNull();
    expect(buildAuthorizationConsentEvent().granted).toBe(true);
    expect(buildAuthorizationConsentEvent().wording).toBe('Participo.');
    // The factory version is a valid editable version (RAPP-614).
    expect(authorizationContentSchema.safeParse(version.content).success).toBe(true);
  });

  test('a walk-in waits for review on the current version, with no profile yet', () => {
    const walkIn = buildWalkInSigning();
    expect(walkIn.status).toBe('pending');
    expect(walkIn.version_id).toBe(buildAuthorizationVersion().id);
    expect(walkIn.resolved_profile_id).toBeNull();
  });
});

describe('buildCustomQuestionState', () => {
  test('is a staff choice on the seeded Ramassà field for the invited woman', () => {
    const state = buildCustomQuestionState();
    expect(state.profile_id).toBe(INVITED_ACCOUNT_ID);
    expect(state.org_id).toBe(SEED_ORGANIZATION_ID);
    expect(state.question_id).toBe(SEED_CUSTOM_QUESTION_ID);
    expect(['ask', 'skip']).toContain(state.state);
  });
});

describe('the question builder rows (RAPP-307)', () => {
  test('a field is placed on its screen, and an answer names the field', () => {
    const screen = buildIntakeScreen();
    const field = buildProfileField();
    expect(buildFieldPlacement().screen_key).toBe(screen.id);
    expect(buildCustomAnswer().question_id).toBe(field.id);
    expect(buildReferralCustomAnswer().question_id).toBe(field.id);
    expect(buildCustomQuestionOption().is_archived).toBe(false);
  });

  test('a plain answer has no encrypted copy, and the key of no season is the zero uuid', () => {
    const answer = buildCustomAnswer();
    expect(answer.value_encrypted).toBeNull();
    expect(answer.season_key).toBe('00000000-0000-0000-0000-000000000000');
  });

  test('a typed field carries settings the shared schema accepts (RAPP-610)', () => {
    const consent = buildTypedProfileField('consent', {
      text: { ca: 'Accepto' },
      requires_signature: true,
    });
    expect(questionSettingsSchema('consent').safeParse(consent.settings).success).toBe(true);
    const number = buildTypedProfileField('number', { integer: true, max: 15 });
    expect(questionSettingsSchema('number').safeParse(number.settings).success).toBe(true);
    expect(buildProfileField().settings).toEqual({});
  });

  test('the preset asks the sizes', () => {
    expect(buildIntakeStatePreset().states).toEqual({ clothing_size: 'ask', shoe_size: 'ask' });
  });
});

test('a placement stays optional by default (RAPP-611)', () => {
  expect(buildFieldPlacement().required).toBe(false);
});

test('built-in screen wording and the flow order match the seed (RAPP-612)', () => {
  expect(buildIntakeBuiltinScreen().screen).toBe('summary');
  expect(buildIntakeBuiltinScreen().is_hidden).toBe(false);
  expect(buildIntakeBuiltinScreen({ screen: 'documentation', is_hidden: true }).is_hidden).toBe(
    true,
  );
  const order = buildIntakeFlowOrder().step_order;
  expect(order[0]).toBe('identity');
  expect(order).toContain('custom:5eed0000-0000-4000-8044-000000000001');
  expect(order).not.toContain('summary');
});

test('app terms signature fixtures are independently linked and overrideable', () => {
  const row = buildAppTermsSignature();
  expect(row.profile_id).toBe(seedUserId(11));
  expect(row.org_id).toBe(SEED_ORGANIZATION_ID);
  expect(row.signature).toEqual([
    [
      [100, 200],
      [300, 400],
    ],
  ]);
  expect(row.unable_to_draw).toBe(false);
  expect(buildAppTermsSignature({ unable_to_draw: true, signature: null }).signature).toBeNull();
});

describe('onboarding design sandbox factories (RAPP-615)', () => {
  test('the test player is an invited test account, never a roster participant', () => {
    const player = buildTestPlayer();
    expect(player.is_test_account).toBe(true);
    expect(player.role).toBe('invited');
    expect(player.id).toBe(TEST_PLAYER_ID);
    expect(PARTICIPANT_FIXTURES.some((fixture) => seedUserId(fixture.ordinal) === player.id)).toBe(
      false,
    );
  });

  test('the designer is a staff test account outside the roster', () => {
    const designer = buildOnboardingDesigner();
    expect(designer.role).toBe('staff');
    expect(designer.is_test_account).toBe(true);
    expect(STAFF_FIXTURES.some((fixture) => seedUserId(fixture.ordinal) === designer.id)).toBe(
      false,
    );
  });

  test('every other factory builds a real person', () => {
    expect(buildParticipant().is_test_account).toBe(false);
    expect(buildProfile().is_test_account).toBe(false);
  });
});
