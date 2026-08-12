import { describe, expect, test } from 'bun:test';
import { maestroSmokeCommand, parseSmokeMetroPort } from './qa-smoke';

const flowPath = new URL('../.maestro/messaging.yaml', import.meta.url);
const shellFlowPath = new URL('../.maestro/smoke-shells.yaml', import.meta.url);

describe('durable messaging device flow', () => {
  test('isolates Maestro debug output per flow', () => {
    expect(
      maestroSmokeCommand('emulator-5558', '/repo/.flow-shots/messaging.yaml', '/tmp/debug'),
    ).toEqual([
      'maestro',
      '--device',
      'emulator-5558',
      'test',
      '--debug-output',
      '/tmp/debug',
      '--flatten-debug-output',
      '/repo/.flow-shots/messaging.yaml',
    ]);
  });

  test('accepts an explicit private Metro port for an isolated closure run', () => {
    expect(parseSmokeMetroPort('18049')).toBe(18_049);
    expect(parseSmokeMetroPort(undefined)).toBeUndefined();
    expect(() => parseSmokeMetroPort('not-a-port')).toThrow('valid TCP port');
  });

  test('uses the runner-provided isolated Metro URL', async () => {
    const flow = await Bun.file(flowPath).text();

    expect(flow).toContain('DEV_CLIENT_URL:');
    expect(flow).not.toContain('RAPP47_DEV_CLIENT_URL');
    expect(flow).not.toContain('18047');
  });

  test('restores the queued message after restart before reconnecting', async () => {
    const flow = await Bun.file(flowPath).text();
    const offlineBranch = flow.slice(flow.indexOf('- toggleAirplaneMode'));
    const stopIndex = offlineBranch.indexOf('- stopApp');
    const reopenIndex = offlineBranch.indexOf('- openLink: ${DEV_CLIENT_URL}', stopIndex);
    const restoredQueueIndex = offlineBranch.indexOf('id: message-sync-sending', reopenIndex);
    const reconnectIndex = offlineBranch.indexOf('- toggleAirplaneMode', reopenIndex);

    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(reopenIndex).toBeGreaterThan(stopIndex);
    expect(restoredQueueIndex).toBeGreaterThan(reopenIndex);
    expect(reconnectIndex).toBeGreaterThan(restoredQueueIndex);
  });

  test('sends online on both platforms with the keyboard open and reaches delivered', async () => {
    const flow = await Bun.file(flowPath).text();
    const offlineIndex = flow.indexOf('- toggleAirplaneMode');
    const onlineInputIndex = flow.indexOf('- inputText: rapp49-online-device-send');
    const reachableSendIndex = flow.indexOf(
      '- assertVisible:\n    id: message-send',
      onlineInputIndex,
    );
    const sendIndex = flow.indexOf('- tapOn:\n    id: message-send', reachableSendIndex);
    const deliveredIndex = flow.indexOf('id: message-sync-delivered', sendIndex);

    expect(onlineInputIndex).toBeGreaterThanOrEqual(0);
    expect(reachableSendIndex).toBeGreaterThan(onlineInputIndex);
    expect(sendIndex).toBeGreaterThan(reachableSendIndex);
    expect(deliveredIndex).toBeGreaterThan(sendIndex);
    expect(deliveredIndex).toBeLessThan(offlineIndex);
  });

  test('uses the stable community tab selector on iOS shell QA', async () => {
    const flow = await Bun.file(shellFlowPath).text();

    expect(flow).toContain(
      '- runFlow:\n    when:\n      platform: iOS\n    commands:\n      - tapOn:\n          id: player-tab-community',
    );
  });

  test('opens private team chat from the community board before messaging', async () => {
    const flow = await Bun.file(flowPath).text();
    const communityIndex = flow.indexOf('id: player-tab-community');
    const chatIndex = flow.indexOf('id: forum-open-team-chat', communityIndex);
    const composerIndex = flow.indexOf('id: message-composer', chatIndex);

    expect(communityIndex).toBeGreaterThanOrEqual(0);
    expect(chatIndex).toBeGreaterThan(communityIndex);
    expect(composerIndex).toBeGreaterThan(chatIndex);
  });

  test('dismisses the keyboard before leaving the delivered message thread', async () => {
    const flow = await Bun.file(flowPath).text();
    const deliveredIndex = flow.indexOf('id: message-sync-delivered');
    const offlineBranchIndex = flow.indexOf('- toggleAirplaneMode', deliveredIndex);
    const onlineBranch = flow.slice(deliveredIndex, offlineBranchIndex);
    const iosDismissIndex = onlineBranch.indexOf(
      'platform: iOS\n    commands:\n      - swipe:\n          start: 50%, 35%\n          end: 50%, 55%',
    );
    const profileIndex = flow.indexOf('id: player-tab-profile', deliveredIndex);

    expect(iosDismissIndex).toBeGreaterThanOrEqual(0);
    expect(profileIndex).toBeGreaterThan(offlineBranchIndex);
  });

  test('returns from the nested team chat route before opening profile', async () => {
    const flow = await Bun.file(flowPath).text();
    const reconnectIndex = flow.indexOf('id: message-sync-retrying');
    const backIndex = flow.indexOf('id: team-chat-back', reconnectIndex);
    const profileIndex = flow.indexOf('id: player-tab-profile', backIndex);

    expect(reconnectIndex).toBeGreaterThanOrEqual(0);
    expect(backIndex).toBeGreaterThan(reconnectIndex);
    expect(profileIndex).toBeGreaterThan(backIndex);
  });
});
