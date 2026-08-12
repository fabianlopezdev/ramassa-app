import { describe, expect, test } from 'bun:test';
import { parseSmokeMetroPort } from './qa-smoke';

const flowPath = new URL('../.maestro/messaging.yaml', import.meta.url);

describe('durable messaging device flow', () => {
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
});
