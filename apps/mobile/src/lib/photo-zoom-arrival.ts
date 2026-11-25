/**
 * Whether a screen arrives by the photo zoom of RAPP-916. That screen grows
 * out of the card's photo, so the entrance every screen gets the first time
 * (RAPP-875) stays still: a fade and a rise on top of the zoom would fight it.
 *
 * expo-router marks such a navigation with this param. The name is its own and
 * not exported for apps; a test reads it from the installed expo-router, so an
 * update that renames it fails there first.
 */
export const ZOOM_TRANSITION_SOURCE_PARAM = '__internal_expo_router_zoom_transition_source_id';

export function arrivesByPhotoZoom(params: object | undefined): boolean {
  if (params === undefined) return false;
  return typeof (params as Record<string, unknown>)[ZOOM_TRANSITION_SOURCE_PARAM] === 'string';
}
