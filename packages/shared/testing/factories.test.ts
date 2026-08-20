import { describe, expect, test } from 'bun:test';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import {
  buildAnnouncement,
  buildAttendance,
  buildAuditLogEntry,
  buildEvent,
  buildEventCategory,
  buildEventOccurrence,
  buildEventSignup,
  buildForumCategory,
  buildForumFlag,
  buildForumPost,
  buildForumReply,
  buildInvite,
  buildKnowledgeArticle,
  buildKnowledgeCategory,
  buildMentoringRequest,
  buildOrganization,
  buildParticipant,
  buildParticipantNote,
  buildParticipants,
  buildParticipantStory,
  buildProfile,
  buildPushToken,
  buildService,
  buildServiceCategory,
  buildServiceImage,
  buildServiceInterest,
} from './factories';
import {
  ONBOARDING_ACCOUNT_EMAIL,
  PARTICIPANT_FIXTURES,
  SEED_ACCOUNT_PASSWORD,
  SEED_ORGANIZATION_ID,
  seedUserId,
  STAFF_FIXTURES,
} from './fixtures';

describe('fixtures — the roster the seed and the factories share', () => {
  /**
   * Two reserved domains, both unroutable. `@example.test` is the fixture
   * domain; `@ramassa.invalid` is what the product itself generates for a
   * participant with no inbox (RAPP-25), reserved by RFC 2606 so it can never
   * acquire one. Anything else would be a real address in test data.
   */
  test('every fixture email is under a reserved, unroutable domain', () => {
    for (const fixture of [...PARTICIPANT_FIXTURES, ...STAFF_FIXTURES]) {
      expect(
        fixture.email.endsWith('@example.test') || fixture.email.endsWith('@ramassa.invalid'),
      ).toBe(true);
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
    expect(buildParticipant({ city: 'Manlleu' }).city).toBe('Manlleu');
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
