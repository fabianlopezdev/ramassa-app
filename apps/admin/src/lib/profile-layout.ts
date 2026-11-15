/**
 * The Dades de les jugadores page's data (RAPP-650): the layout the catalog sends
 * (sections, fields, placements, RAPP-649), read for the page. Pure, so it is
 * tested without a database; its changes are in `profile-layout-actions.ts`.
 */

import type { FieldFormValue } from '@/components/fields/field-form';
import { PROFILE_LAYOUT_PERMISSIONS } from '@/lib/nav-items';
import {
  EMPTY_PROFILE_LAYOUT,
  parseQuestionSettings,
  placementsOf,
  PROFILE_SURFACES,
  type IntakeCatalog,
  type ProfileField,
  type ProfileLayout,
  type ProfileSurface,
} from '@ramassa/shared/intake-builder';
import type { PermissionCode } from '@ramassa/shared/permissions';

export function canDesignProfileLayout(permissions: ReadonlySet<PermissionCode>): boolean {
  return PROFILE_LAYOUT_PERMISSIONS.some((code) => permissions.has(code));
}

export function profileLayoutOf(catalog: IntakeCatalog): ProfileLayout {
  return catalog.layout ?? EMPTY_PROFILE_LAYOUT;
}

/** The surfaces that ask a field, in one fixed order; none means the team's only. */
export function surfacesOfField(layout: ProfileLayout, fieldId: string): readonly ProfileSurface[] {
  const placed = new Set(placementsOf(layout, fieldId).map((placement) => placement.surface));
  return PROFILE_SURFACES.filter((surface) => placed.has(surface));
}

/** A saved field as the field form starts from it. */
export function fieldFormValue(field: ProfileField): FieldFormValue {
  return {
    type: field.type,
    label: field.label,
    help: field.help,
    privacy: field.privacy,
    readPermission: field.readPermission ?? null,
    settings: parseQuestionSettings(field.type, field.settings),
    options: field.options.filter((option) => !option.isArchived),
  };
}

const RAMASSA_SCREEN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The app screen that asks an app field with its own control (the date boxes,
 * the document cards...), or null. A new type changes what that screen shows
 * (RAPP-665), so the change dialog names it.
 */
export function appScreenOfField(layout: ProfileLayout, field: ProfileField): string | null {
  if (field.kind !== 'builtin') return null;
  const screen = placementsOf(layout, field.id).find(
    (placement) => placement.surface === 'onboarding',
  )?.screenKey;
  return screen === undefined || screen === null || RAMASSA_SCREEN_ID.test(screen) ? null : screen;
}
