/**
 * The day a gallery photo or video was shared, as a tile shows it (RAPP-913):
 * in her language, on the club's calendar. One formatter per language, made
 * once, so a long grid does not build one per tile.
 */
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';

const galleryDateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatGalleryDate(sharedAt: string, locale: string): string {
  let formatter = galleryDateFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: MADRID_TIME_ZONE,
    });
    galleryDateFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(sharedAt));
}
