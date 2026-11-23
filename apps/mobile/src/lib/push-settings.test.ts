import { describe, expect, test } from 'bun:test';
import { describeNotificationSwitch, planNotificationSwitchChange } from './push-settings';

describe('her notifications switch (RAPP-956)', () => {
  test('the switch is on only when she wants them and the phone lets them through', () => {
    expect(describeNotificationSwitch(true, 'granted')).toEqual({
      isOn: true,
      isBlockedByPhone: false,
    });
    expect(describeNotificationSwitch(false, 'granted').isOn).toBe(false);
    expect(describeNotificationSwitch(true, 'undetermined').isOn).toBe(false);
    expect(describeNotificationSwitch(true, 'denied').isOn).toBe(false);
  });

  test('a phone that blocks them says so, whatever her own switch holds', () => {
    expect(describeNotificationSwitch(true, 'denied').isBlockedByPhone).toBe(true);
    expect(describeNotificationSwitch(false, 'denied').isBlockedByPhone).toBe(true);
    expect(describeNotificationSwitch(true, 'undetermined').isBlockedByPhone).toBe(false);
  });

  test('turning them off saves her choice and leaves the phone alone', () => {
    for (const permission of ['granted', 'denied', 'undetermined'] as const) {
      expect(planNotificationSwitchChange(false, permission)).toEqual(['save-off']);
    }
  });

  test('turning them on asks the phone only when it was never asked', () => {
    expect(planNotificationSwitchChange(true, 'undetermined')).toEqual(['save-on', 'ask-phone']);
    expect(planNotificationSwitchChange(true, 'granted')).toEqual(['save-on', 'register-device']);
    expect(planNotificationSwitchChange(true, 'denied')).toEqual(['save-on']);
  });
});
