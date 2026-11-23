/**
 * Whether a screen arrives by the photo zoom of RAPP-916. That screen grows
 * out of the card's photo, so the entrance every screen gets the first time
 * (RAPP-875) stays still: a fade and a rise on top of the zoom would fight it.
 *
 * On iOS expo-router marks such a navigation with this param. The name is its
 * own and not exported for apps; a test reads it from the installed
 * expo-router, so an update that renames it fails there first.
 */
import type { Href } from 'expo-router';

export const ZOOM_TRANSITION_SOURCE_PARAM = '__internal_expo_router_zoom_transition_source_id';

/**
 * On Android the card's photo moves into the screen through Reanimated
 * (RAPP-920), which marks nothing, so the card marks the screen it opens with
 * this param of its own.
 */
export const PHOTO_ZOOM_ARRIVAL_PARAM = 'photoZoom';
const PHOTO_ZOOM_ARRIVAL_VALUE = '1';

/** The screen a card opens, marked as reached by the move of its photo. */
export function withPhotoZoomArrival(href: Href): Href {
  if (typeof href === 'string') {
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}${PHOTO_ZOOM_ARRIVAL_PARAM}=${PHOTO_ZOOM_ARRIVAL_VALUE}` as Href;
  }
  return {
    ...href,
    params: { ...href.params, [PHOTO_ZOOM_ARRIVAL_PARAM]: PHOTO_ZOOM_ARRIVAL_VALUE },
  } as Href;
}

export function arrivesByPhotoZoom(params: object | undefined): boolean {
  if (params === undefined) return false;
  const routeParams = params as Record<string, unknown>;
  return (
    typeof routeParams[ZOOM_TRANSITION_SOURCE_PARAM] === 'string' ||
    routeParams[PHOTO_ZOOM_ARRIVAL_PARAM] === PHOTO_ZOOM_ARRIVAL_VALUE
  );
}
