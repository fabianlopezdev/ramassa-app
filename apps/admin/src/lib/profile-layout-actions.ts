/**
 * The changes to the profile layout: the Dades de les jugadores page's (RAPP-650)
 * and the placements a surface editor makes (RAPP-651). Each one is written
 * through the database's own function (RAPP-649), then the route reloads, as
 * the onboarding editor does.
 */

import type { FieldFormDraft } from '@/components/fields/field-form';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import {
  archiveProfileField,
  moveProfileField,
  placeField,
  profileFieldAnswerCount,
  removePlacement,
  reorderPlacements,
  reorderProfileSections,
  savePlacement,
  saveProfileField,
  saveProfileSection,
  type BuilderText,
  type ProfileField,
  type ProfileSection,
  type ProfileSurface,
} from '@ramassa/shared/intake-builder';

/** The changes of the page, each reloading the route once the database said yes. */
export function useProfileLayoutActions() {
  const router = useRouter();
  const reload = () => router.invalidate({ sync: true });
  return {
    async saveSection(id: string | null, title: BuilderText): Promise<void> {
      await saveProfileSection(supabase, id, title);
      await reload();
    },
    async reorderSections(ids: readonly string[]): Promise<void> {
      await reorderProfileSections(supabase, ids);
      await reload();
    },
    async saveField(
      field: ProfileField | null,
      section: ProfileSection,
      draft: FieldFormDraft,
    ): Promise<string> {
      const id = await saveProfileField(supabase, {
        id: field?.id ?? null,
        // An edit keeps the field where it is; dragging moves it.
        sectionId: field === null ? section.id : null,
        type: draft.type,
        label: draft.label,
        help: draft.help,
        privacy: draft.privacy,
        defaultRequired: field?.defaultRequired ?? false,
        options: draft.options.map((option) =>
          option.id === null ? { label: option.label } : { id: option.id, label: option.label },
        ),
        settings: draft.settings,
      });
      await reload();
      return id;
    },
    async archiveField(id: string): Promise<void> {
      await archiveProfileField(supabase, id);
      await reload();
    },
    async moveField(id: string, sectionId: string, order: readonly string[]): Promise<void> {
      await moveProfileField(supabase, id, sectionId, order);
      await reload();
    },
    answerCount(id: string): Promise<number> {
      return profileFieldAnswerCount(supabase, id);
    },
    /**
     * Puts fields on a surface (and screen), in the order given, each
     * required as its field's default. Stops at the first refusal; the
     * route reloads either way, so the page shows what was placed.
     */
    async placeFields(
      surface: ProfileSurface,
      screenKey: string | null,
      fieldIds: readonly string[],
    ): Promise<void> {
      try {
        for (const fieldId of fieldIds) {
          await placeField(supabase, fieldId, surface, screenKey);
        }
      } finally {
        await reload();
      }
    },
    /** Takes a field off a surface; the field and its answers stay. */
    async removePlacement(placementId: string): Promise<void> {
      await removePlacement(supabase, placementId);
      await reload();
    },
    async reorderPlacements(
      surface: ProfileSurface,
      screenKey: string | null,
      ids: readonly string[],
    ): Promise<void> {
      await reorderPlacements(supabase, surface, screenKey, ids);
      await reload();
    },
    /** Required on this surface and the wording per language. */
    async savePlacement(
      placementId: string,
      change: {
        readonly required: boolean;
        readonly labelOverride: BuilderText | null;
        readonly helpOverride: BuilderText | null;
      },
    ): Promise<void> {
      await savePlacement(supabase, placementId, change);
      await reload();
    },
  };
}
