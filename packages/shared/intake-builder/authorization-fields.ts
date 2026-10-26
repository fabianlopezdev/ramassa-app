/**
 * The season authorization's Health screen (RAPP-698): the fields placed on
 * it, asked with the generic field renderer like any screen's. Her health
 * information and her emergency contact are four of them, team fields like
 * any other; staff add, remove, reword and require fields there.
 */

import { questionFromField, type CustomQuestion, type IntakeCatalog } from './builder';
import {
  placementsOnSurface,
  placementWording,
  type AuthorizationFieldKey,
} from './profile-layout';

/** The Health screen's questions in their order, worded and required as each placement says. */
export function authorizationQuestions(catalog: IntakeCatalog): readonly CustomQuestion[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return placementsOnSurface(layout, 'authorization').flatMap((placement) => {
    const field = layout.fields.find((each) => each.id === placement.fieldId);
    return field === undefined
      ? []
      : [{ ...questionFromField(field, placement), ...placementWording(placement, field) }];
  });
}

/** The id of one of the authorization's own fields, or null when the organization has none. */
export function authorizationFieldId(
  catalog: IntakeCatalog,
  key: AuthorizationFieldKey,
): string | null {
  return catalog.layout?.fields.find((field) => field.authorizationKey === key)?.id ?? null;
}
