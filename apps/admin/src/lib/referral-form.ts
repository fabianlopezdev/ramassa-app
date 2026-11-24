/**
 * The referral form on the board (RAPP-938): the form the entity fills in,
 * read as a form of the engine so the board, the phones and the screen
 * editor every form uses draw it as they draw any form.
 *
 * Its fields and blocks are the entity form's (surface `entity_form`), which
 * the catalog sends with no screen so installed phone builds read them as one
 * list. The view below adds a copy of each on its screen of the referral
 * form, the way a form's own rows look; every write still goes to the entity
 * form's rows, which keep the same ids.
 */

import {
  EMPTY_PROFILE_LAYOUT,
  entityFormBlocksOf,
  entityFormItems,
  entityFormScreenOf,
  isAlwaysOnEntityForm,
  type CustomForm,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';

export interface ReferralFormView {
  /** The catalog with the referral form among its forms, its rows on its screens. */
  readonly catalog: IntakeCatalog;
  readonly form: CustomForm;
}

/** The referral form as a form of the engine; null from a server before it. */
export function referralFormView(catalog: IntakeCatalog): ReferralFormView | null {
  const entityForm = catalog.entityForm;
  if (entityForm === undefined) return null;
  const form: CustomForm = {
    id: entityForm.id,
    name: entityForm.name,
    filledBy: 'entity',
    mandatory: 'optional',
    deadline: null,
    audience: 'all',
    repeatsEachSeason: false,
    kind: 'other',
    systemKey: 'entity_referral',
    recipientCount: null,
    version: 1,
    publishedAt: null,
    isArchived: false,
    versions: [],
    screens: entityForm.screens,
  };
  const layout = catalog.layout ?? EMPTY_PROFILE_LAYOUT;
  const onItsScreen = (id: string) => ({
    surface: 'custom_form' as const,
    customFormId: form.id,
    screenKey: entityFormScreenOf(catalog, id),
  });
  return {
    form,
    catalog: {
      ...catalog,
      customForms: [...(catalog.customForms ?? []), form],
      layout: {
        ...layout,
        placements: [
          ...layout.placements,
          ...entityFormItems(layout).map((item) => ({
            ...item.placement,
            ...onItsScreen(item.placement.id),
          })),
        ],
      },
      blocks: [
        ...(catalog.blocks ?? []),
        ...entityFormBlocksOf(catalog).map((block) => ({ ...block, ...onItsScreen(block.id) })),
      ],
    },
  };
}

/** Whether a screen of the referral form asks her names: it is never deleted. */
export function asksHerNames(catalog: IntakeCatalog, screenId: string): boolean {
  return entityFormItems(catalog.layout ?? EMPTY_PROFILE_LAYOUT).some(
    (item) =>
      isAlwaysOnEntityForm(item.field) &&
      entityFormScreenOf(catalog, item.placement.id) === screenId,
  );
}
