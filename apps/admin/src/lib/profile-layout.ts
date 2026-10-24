/**
 * The Dades de les jugadores page's data (RAPP-650): the layout the catalog sends
 * (sections, fields, placements, RAPP-649), read for the page. Pure, so it is
 * tested without a database; its changes are in `profile-layout-actions.ts`.
 */

import type { FieldFormValue } from '@/components/fields/field-form';
import { PROFILE_LAYOUT_PERMISSIONS } from '@/lib/nav-items';
import {
  EMPTY_PROFILE_LAYOUT,
  fieldsOfSection,
  isTeamOnly,
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

export interface ProfileLayoutCounts {
  readonly sections: number;
  readonly fields: number;
  readonly sensitive: number;
  readonly teamOnly: number;
}

/** The count line over the sections; archived fields do not count. */
export function profileLayoutCounts(layout: ProfileLayout): ProfileLayoutCounts {
  const live = layout.fields.filter((field) => !field.isArchived);
  return {
    sections: layout.sections.length,
    fields: live.length,
    sensitive: live.filter((field) => field.privacy === 'sensitive').length,
    teamOnly: live.filter((field) => isTeamOnly(layout, field.id)).length,
  };
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
    settings: parseQuestionSettings(field.type, field.settings),
    options: field.options.filter((option) => !option.isArchived),
  };
}

/**
 * The privacy level is fixed once anything was answered. A reader the
 * catalog does not tell (null) is not a designer and edits nothing.
 */
export function isPrivacyLocked(field: ProfileField | null): boolean {
  return field !== null && field.hasAnswers !== false;
}
