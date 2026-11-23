import { describe, expect, test } from 'bun:test';
import { INTERNAL_EXPO_ROUTER_ZOOM_TRANSITION_SOURCE_ID_PARAM_NAME } from 'expo-router/build/navigationParams';
import { arrivesByPhotoZoom, ZOOM_TRANSITION_SOURCE_PARAM } from './photo-zoom-arrival';

describe('a screen that grows out of a card photo (RAPP-916)', () => {
  test('reads the param the installed expo-router marks a zoom with', () => {
    expect(ZOOM_TRANSITION_SOURCE_PARAM).toBe(
      INTERNAL_EXPO_ROUTER_ZOOM_TRANSITION_SOURCE_ID_PARAM_NAME,
    );
  });

  test('arrives by zoom only when the navigation carries a zoom source', () => {
    expect(arrivesByPhotoZoom({ id: 'post-1', [ZOOM_TRANSITION_SOURCE_PARAM]: ':r1:' })).toBe(true);
    expect(arrivesByPhotoZoom({ id: 'post-1' })).toBe(false);
    expect(arrivesByPhotoZoom(undefined)).toBe(false);
  });
});
