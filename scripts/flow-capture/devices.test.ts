import { describe, expect, test } from 'bun:test';
import { isAndroidBootReady } from './devices';

describe('Android boot readiness', () => {
  test('accepts a live package service when this image exposes neither boot property', () => {
    expect(
      isAndroidBootReady({
        bootAnimation: '',
        bootCompleted: '',
        packageService: 'Service package: found',
      }),
    ).toBe(true);
  });

  test('keeps waiting while an exposed boot animation is running', () => {
    expect(
      isAndroidBootReady({
        bootAnimation: 'running',
        bootCompleted: '1',
        packageService: 'Service package: found',
      }),
    ).toBe(false);
  });
});
