import { describe, expect, test } from 'bun:test';
import type { Href } from 'expo-router';
import type { PermissionCode } from '@ramassa/shared/permissions';
import {
  pushDetailQueryRoot,
  pushReferralUpdateId,
  referralParticipantRoute,
  resolvePushDetailRoute,
  shouldOpenPushDetail,
  type PushRouteAccess,
} from './push-deep-link';

const player: PushRouteAccess = { permissions: new Set(), start: '/' as Href };

function team(...permissions: readonly PermissionCode[]): PushRouteAccess {
  return { permissions: new Set(permissions), start: '/today' as Href };
}

const FLAG_ID = '40000000-0000-4000-8000-000000000001';
const REFERRAL_UPDATE_ID = '50000000-0000-4000-8000-000000000001';
const PARTICIPANT_ID = '60000000-0000-4000-8000-000000000001';

describe('push detail routes', () => {
  test('announcement taps open only the announcement detail route', () => {
    expect(
      resolvePushDetailRoute(
        {
          contentType: 'announcement',
          contentId: '10000000-0000-4000-8000-000000000001',
        },
        player,
      ),
    ).toBe('/announcement/10000000-0000-4000-8000-000000000001');
  });

  test('event taps open only the event detail route', () => {
    expect(
      resolvePushDetailRoute(
        {
          contentType: 'event',
          contentId: '20000000-0000-4000-8000-000000000001',
        },
        player,
      ),
    ).toBe('/event/20000000-0000-4000-8000-000000000001');
  });

  test('message taps open the single team chat and refresh its unread state', () => {
    expect(
      resolvePushDetailRoute(
        {
          contentType: 'message',
          contentId: '30000000-0000-4000-8000-000000000001',
        },
        player,
      ),
    ).toBe('/team-chat' as Href);
    expect(pushDetailQueryRoot('message')).toBe('messaging');
  });

  test('mentoring schedule taps open the private mentoring screen', () => {
    expect(
      resolvePushDetailRoute(
        {
          contentType: 'mentoring_update',
          contentId: '30000000-0000-4000-8000-000000000002',
        },
        player,
      ),
    ).toBe('/mentoring' as Href);
    expect(pushDetailQueryRoot('mentoring_update')).toBe('player-mentoring');
  });

  test('a form the team created opens the form she was asked (RAPP-700)', () => {
    expect(
      resolvePushDetailRoute(
        {
          contentType: 'custom_form',
          contentId: '5eed0000-0000-4000-8102-000000000002',
        },
        player,
      ),
    ).toBe('/form/5eed0000-0000-4000-8102-000000000002' as Href);
    expect(pushDetailQueryRoot('custom_form')).toBe('player-forms');
  });

  test('refreshes the content collection before opening a newly published detail', () => {
    expect(pushDetailQueryRoot('announcement')).toBe('player-announcements');
    expect(pushDetailQueryRoot('event')).toBe('player-events');
  });

  test.each([
    [null],
    [{}],
    [{ contentType: 'story', contentId: '10000000-0000-4000-8000-000000000001' }],
    [{ contentType: 'announcement', contentId: '../profile' }],
    [{ contentType: 'forum_flag', contentId: '../profile' }],
    [{ contentType: 'referral_update', contentId: 'not-an-id' }],
    [{ url: '/profile-delete-data' }],
  ])('rejects malformed or arbitrary notification data', (data) => {
    expect(resolvePushDetailRoute(data, team('forum.moderate', 'participants.view'))).toBeNull();
  });

  test('cold-start navigation waits for a signed-in, onboarded person, her access and a mounted router', () => {
    const ready = {
      hasSession: true,
      needsOnboarding: false,
      isNavigationReady: true,
      isAccessKnown: true,
    };

    expect(shouldOpenPushDetail(ready)).toBe(true);
    expect(shouldOpenPushDetail({ ...ready, hasSession: false })).toBe(false);
    expect(shouldOpenPushDetail({ ...ready, needsOnboarding: true })).toBe(false);
    expect(shouldOpenPushDetail({ ...ready, isNavigationReady: false })).toBe(false);
    expect(shouldOpenPushDetail({ ...ready, isAccessKnown: false })).toBe(false);
  });
});

describe('forum report pushes (X4)', () => {
  const data = { contentType: 'forum_flag', contentId: FLAG_ID };

  test('open the forum moderation screen for a moderator', () => {
    expect(resolvePushDetailRoute(data, team('forum.moderate'))).toBe('/forum-moderation' as Href);
  });

  test('land a team member without moderation on her start screen', () => {
    expect(resolvePushDetailRoute(data, team('attendance.mark'))).toBe('/today' as Href);
  });

  test('refresh the moderation queue before it opens', () => {
    expect(pushDetailQueryRoot('forum_flag')).toBe('forum-moderation');
  });
});

describe('incident report pushes (RAPP-973)', () => {
  const data = { contentType: 'incident_report', contentId: FLAG_ID };

  test('open the incidents screen for incidents.manage', () => {
    expect(resolvePushDetailRoute(data, team('incidents.manage'))).toBe('/team-incidents' as Href);
  });

  test('land a team member who reads mentoring only on her start screen', () => {
    expect(resolvePushDetailRoute(data, team('mentoring.manage'))).toBe('/today' as Href);
  });

  test('refresh the incidents before they open', () => {
    expect(pushDetailQueryRoot('incident_report')).toBe('incidents');
  });
});

describe('referral update pushes (X4)', () => {
  const data = { contentType: 'referral_update', contentId: REFERRAL_UPDATE_ID };

  test('open the participants list while her card is not known yet', () => {
    expect(resolvePushDetailRoute(data, team('referrals.manage', 'participants.view'))).toBe(
      '/participants' as Href,
    );
  });

  test('land a team member who cannot see participants on her start screen', () => {
    expect(resolvePushDetailRoute(data, team('referrals.manage'))).toBe('/today' as Href);
  });

  test('carry the referral update id, the only identifier the payload has', () => {
    expect(pushReferralUpdateId(data)).toBe(REFERRAL_UPDATE_ID);
    expect(pushReferralUpdateId({ contentType: 'forum_flag', contentId: FLAG_ID })).toBeNull();
    expect(pushReferralUpdateId({ contentType: 'referral_update', contentId: 'x' })).toBeNull();
  });

  test('open her card once the update names her', () => {
    expect(referralParticipantRoute(PARTICIPANT_ID, team('participants.view'))).toBe(
      `/participant/${PARTICIPANT_ID}` as Href,
    );
  });

  test('fall back to the list when the referred woman has no account yet', () => {
    expect(referralParticipantRoute(null, team('participants.view'))).toBe('/participants' as Href);
    expect(referralParticipantRoute('../profile', team('participants.view'))).toBe(
      '/participants' as Href,
    );
  });

  test('never open her card for a reader who cannot see participants', () => {
    expect(referralParticipantRoute(PARTICIPANT_ID, team('referrals.manage'))).toBe(
      '/today' as Href,
    );
  });

  test('refresh the participant reads before her card opens', () => {
    expect(pushDetailQueryRoot('referral_update')).toBe('participants');
  });
});
