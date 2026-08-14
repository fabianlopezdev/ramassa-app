import { describe, expect, test } from 'bun:test';
import {
  acceptPendingEntityInvitation,
  createEntitySchema,
  fetchEntityDashboard,
  inviteEntityCollaborator,
  inviteEntityCollaboratorSchema,
  setEntityActive,
} from './entity-management';

describe('entity tracking and management contracts', () => {
  test('validates trimmed entity and collaborator inputs', () => {
    expect(createEntitySchema.parse({ name: '  Fundació Nova  ' })).toEqual({
      name: 'Fundació Nova',
    });
    expect(
      inviteEntityCollaboratorSchema.parse({
        email: ' PERSONA@EXAMPLE.TEST ',
        firstName: ' Núria ',
        lastName: ' Soler ',
      }),
    ).toEqual({
      email: 'persona@example.test',
      firstName: 'Núria',
      lastName: 'Soler',
    });
  });

  test('loads independent dashboard resources concurrently and parses privacy suppression', async () => {
    const starts: string[] = [];
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rpc = async (name: string) => {
      starts.push(name);
      if (starts.length === 4) release?.();
      await barrier;
      if (name === 'get_entity_impact_summary') {
        return {
          data: [
            {
              suppressed: true,
              referred_count: null,
              active_count: null,
              inactive_count: null,
              attendance_present_count: null,
              attendance_eligible_count: null,
              attendance_marked_count: null,
              attendance_rate: null,
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    };

    const dashboard = await fetchEntityDashboard({ rpc } as never);

    expect(starts).toEqual([
      'get_entity_impact_summary',
      'list_entity_participation_trend',
      'list_entity_referral_tracking',
      'list_entity_upcoming_events',
    ]);
    expect(dashboard.impact.suppressed).toBe(true);
    expect(dashboard.impact.attendanceRate).toBeNull();
  });

  test('uses typed administration RPCs without exposing an invitation secret', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const rpc = async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === 'invite_entity_collaborator') {
        return {
          data: [
            {
              invitation_id: '5eed0000-0000-4000-8040-000000000099',
              profile_id: '5eed0000-0000-4000-8000-000000000099',
              email: 'persona@example.test',
              expires_at: '2026-09-14T00:00:00Z',
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    };

    const invitation = await inviteEntityCollaborator(
      { rpc } as never,
      '5eed0000-0000-4000-8030-000000000001',
      { email: 'persona@example.test', firstName: 'Núria', lastName: 'Soler' },
    );
    await setEntityActive({ rpc } as never, '5eed0000-0000-4000-8030-000000000001', false);

    expect(invitation).toEqual({
      invitationId: '5eed0000-0000-4000-8040-000000000099',
      profileId: '5eed0000-0000-4000-8000-000000000099',
      email: 'persona@example.test',
      expiresAt: '2026-09-14T00:00:00Z',
    });
    expect(JSON.stringify(invitation)).not.toContain('token');
    expect(calls.at(-1)).toEqual({
      name: 'set_collaborating_entity_active',
      args: {
        p_collaborating_entity_id: '5eed0000-0000-4000-8030-000000000001',
        p_is_active: false,
      },
    });
  });

  test('accepts the address-bound invitation after the magic-link session opens', async () => {
    const names: string[] = [];
    const rpc = async (name: string) => {
      names.push(name);
      return name === 'my_entity_invitation'
        ? {
            data: [
              {
                invitation_id: '5eed0000-0000-4000-8040-000000000099',
                collaborating_entity_id: '5eed0000-0000-4000-8030-000000000001',
                entity_name: 'Fundació Nova',
                invited_at: '2026-08-14T10:00:00Z',
              },
            ],
            error: null,
          }
        : { data: '5eed0000-0000-4000-8040-000000000099', error: null };
    };

    await acceptPendingEntityInvitation({ rpc } as never);
    expect(names).toEqual(['my_entity_invitation', 'accept_my_entity_invitation']);
  });
});
