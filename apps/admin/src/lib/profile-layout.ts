/**
 * The Fitxa de la jugadora's data (RAPP-650): the layout the catalog sends
 * (sections, fields, placements, RAPP-649), read for the page. Pure, so it is
 * tested without a database; its changes are in `profile-layout-actions.ts`.
 */

import type { FieldFormValue } from '@/components/fields/field-form';
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

/** The permissions that design the layout, as `private.require_question_builder` checks. */
export const PROFILE_LAYOUT_DESIGN_PERMISSIONS = [
  'settings.organization',
  'onboarding.design',
] as const satisfies readonly PermissionCode[];

export function canDesignProfileLayout(permissions: ReadonlySet<PermissionCode>): boolean {
  return PROFILE_LAYOUT_DESIGN_PERMISSIONS.some((code) => permissions.has(code));
}

export function profileLayoutOf(catalog: IntakeCatalog): ProfileLayout {
  return catalog.layout ?? EMPTY_PROFILE_LAYOUT;
}

/** Each section's live field ids, in order: the board's starting state. */
export function fieldIdsBySection(layout: ProfileLayout): Record<string, readonly string[]> {
  return Object.fromEntries(
    layout.sections.map((section) => [
      section.id,
      fieldsOfSection(layout, section.id).map((field) => field.id),
    ]),
  );
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

/**
 * The new order of the fields after a drag, by section, read against the
 * order before it: the section a field landed in, with its full new order.
 * Null when nothing moved.
 */
export function fieldMove(
  before: Record<string, readonly string[]>,
  after: Record<string, readonly string[]>,
  fieldId: string,
): { readonly sectionId: string; readonly order: readonly string[] } | null {
  const sectionId = Object.keys(after).find((id) => after[id]?.includes(fieldId));
  if (sectionId === undefined) return null;
  const order = after[sectionId] ?? [];
  const previous = before[sectionId] ?? [];
  if (previous.length === order.length && previous.every((id, index) => order[index] === id)) {
    return null;
  }
  return { sectionId, order };
}
