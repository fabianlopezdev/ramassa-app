import { describe, expect, test } from 'bun:test';
import { INTERNAL_EXPO_ROUTER_ZOOM_TRANSITION_SOURCE_ID_PARAM_NAME } from 'expo-router/build/navigationParams';
import {
  arrivesByPhotoZoom,
  PHOTO_ZOOM_ARRIVAL_PARAM,
  withPhotoZoomArrival,
  ZOOM_TRANSITION_SOURCE_PARAM,
} from './photo-zoom-arrival';

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

describe('on Android the card marks the screen it opens with its photo (RAPP-920)', () => {
  test('a screen path gains the mark as its one query param', () => {
    expect(withPhotoZoomArrival('/forum/post-1')).toBe(
      `/forum/post-1?${PHOTO_ZOOM_ARRIVAL_PARAM}=1`,
    );
  });

  test('a path that already has a query keeps it and adds the mark', () => {
    expect(withPhotoZoomArrival('/gallery/item-1?from=grid')).toBe(
      `/gallery/item-1?from=grid&${PHOTO_ZOOM_ARRIVAL_PARAM}=1`,
    );
  });

  test('an href object keeps its params and adds the mark', () => {
    expect(withPhotoZoomArrival({ pathname: '/forum/[id]', params: { id: 'post-1' } })).toEqual({
      pathname: '/forum/[id]',
      params: { id: 'post-1', [PHOTO_ZOOM_ARRIVAL_PARAM]: '1' },
    });
  });

  test('the marked screen arrives by zoom, so its first-visit entrance stays still', () => {
    expect(arrivesByPhotoZoom({ id: 'post-1', [PHOTO_ZOOM_ARRIVAL_PARAM]: '1' })).toBe(true);
  });
});
