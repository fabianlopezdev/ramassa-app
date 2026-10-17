import { describe, expect, test } from 'bun:test';
import { junitVerdict, summaryVerdict } from './maestro-run';
import { LAST_ON_SHARD, ORDERED_GROUPS, planShards, sqlBefore, SURVEY_UNDO_SQL } from './shards';
import { parseStatusEnv, qaApiPort, qaConfigToml } from './supabase-stack';

const suite = [
  'attendance-history.yaml',
  'attendance-offline.yaml',
  'attendance.yaml',
  'events-signup.yaml',
  'feed-browse.yaml',
  'forum.yaml',
  'gallery.yaml',
  'knowledge-story.yaml',
  'messaging.yaml',
  'offline-feed.yaml',
  'phase8-feedback.yaml',
  'phase8-mentoring.yaml',
  'phase8-notification.yaml',
  'phase8-survey-ar.yaml',
  'phase8-survey-ca.yaml',
  'smoke-auth.yaml',
  'smoke-i18n.yaml',
  'smoke-onboarding-invited.yaml',
  'smoke-onboarding.yaml',
  'smoke-profile.yaml',
  'smoke-shells.yaml',
];

describe('qa:smoke shard plan', () => {
  test('runs every flow exactly once', () => {
    const shards = planShards(suite, 3);
    expect(shards).toHaveLength(3);
    expect(shards.flatMap((shard) => shard.flows).sort()).toEqual([...suite].sort());
  });

  test('keeps each ordered group on one shard, in order', () => {
    for (const count of [1, 2, 3, 4, 6]) {
      const shards = planShards(suite, count);
      for (const group of ORDERED_GROUPS) {
        const owner = shards.find((shard) => shard.flows.includes(group[0]!));
        const positions = group.map((flow) => owner?.flows.indexOf(flow) ?? -1);
        expect(positions.every((position) => position !== -1)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      }
    }
  });

  test('runs smoke-auth last on its shard', () => {
    const owner = planShards(suite, 3).find((shard) => shard.flows.includes(LAST_ON_SHARD));
    expect(owner?.flows.at(-1)).toBe(LAST_ON_SHARD);
  });

  test('balances by duration', () => {
    const shards = planShards(suite, 3);
    const loads = shards.map((shard) => shard.estimatedSeconds);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThan(400);
  });

  test('never plans more shards than there are groups', () => {
    expect(planShards(['gallery.yaml'], 3)).toHaveLength(1);
  });

  test('undoes the survey response only before the second survey locale', () => {
    expect(sqlBefore('phase8-survey-ca.yaml', [])).toBeUndefined();
    expect(sqlBefore('phase8-survey-ar.yaml', ['phase8-survey-ca.yaml'])).toBe(SURVEY_UNDO_SQL);
    expect(sqlBefore('gallery.yaml', ['phase8-survey-ca.yaml'])).toBeUndefined();
  });
});

describe('qa:smoke Supabase stack', () => {
  const devConfig = [
    'project_id = "ramassa"',
    '[api]',
    'port = 54321',
    '[db]',
    'port = 54322',
    'shadow_port = 54320',
    '[edge_runtime]',
    'inspector_port = 8083',
  ].join('\n');

  test('moves the project id and every port off the dev stack', () => {
    const qa = qaConfigToml(devConfig);
    expect(qa).toContain('project_id = "ramassa-qa"');
    expect(qa).toContain('port = 57321');
    expect(qa).toContain('port = 57322');
    expect(qa).toContain('shadow_port = 57320');
    expect(qa).toContain('inspector_port = 57383');
    expect(qa).not.toMatch(/\b543\d\d\b/);
    expect(qaApiPort(devConfig)).toBe(57321);
  });

  test('reads the stack values from supabase status', () => {
    const env = parseStatusEnv(
      [
        'API_URL="http://127.0.0.1:57321"',
        'ANON_KEY="anon"',
        'SERVICE_ROLE_KEY="service"',
        'DB_URL="postgresql://postgres:postgres@127.0.0.1:57322/postgres"',
      ].join('\n'),
    );
    expect(env.apiUrl).toBe('http://127.0.0.1:57321');
    expect(env.anonKey).toBe('anon');
  });
});

describe('qa:smoke Maestro verdict', () => {
  test('reads the summary line', () => {
    expect(summaryVerdict('1/1 Flow Passed in 21s')).toBe(true);
    expect(summaryVerdict('0/1 Flow Failed in 2m 3s')).toBe(false);
    expect(summaryVerdict('Launch app "com.ramassa.app"... COMPLETED')).toBeUndefined();
  });

  test('reads the JUnit report', () => {
    const pass =
      '<testsuites><testsuite name="s" tests="1" failures="0"><testcase id="a" status="SUCCESS"/></testsuite></testsuites>';
    const fail =
      '<testsuites><testsuite name="s" tests="1" failures="1"><testcase id="a" status="ERROR"/></testsuite></testsuites>';
    expect(junitVerdict(pass)).toBe(true);
    expect(junitVerdict(fail)).toBe(false);
    expect(junitVerdict('')).toBeUndefined();
  });
});
