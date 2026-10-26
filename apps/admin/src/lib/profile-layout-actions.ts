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
  archiveConsent,
  archiveProfileField,
  placeConsent,
  placeField,
  previewFieldChange,
  profileFieldAnswerCount,
  removeConsentPlacement,
  removeFormBlock,
  removePlacement,
  reorderPlacements,
  saveConsent,
  saveConsentPlacement,
  saveFormBlock,
  savePlacement,
  saveProfileField,
  saveProfileSection,
  type BuilderText,
  type ConsentSurface,
  type FieldChangePreview,
  type FormBlockSurface,
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
    async saveField(
      field: ProfileField | null,
      section: ProfileSection,
      draft: FieldFormDraft,
    ): Promise<string> {
      const id = await saveProfileField(supabase, {
        id: field?.id ?? null,
        // An edit keeps the field in its section.
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
    answerCount(id: string): Promise<number> {
      return profileFieldAnswerCount(supabase, id);
    },
    /** What saving the draft would do to the field's answers (RAPP-665). */
    previewChange(id: string, draft: FieldFormDraft): Promise<FieldChangePreview> {
      return previewFieldChange(supabase, id, draft);
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
    /** Adds a signature block to a screen or the entity form, or saves its text (RAPP-690). */
    async saveBlock(block: {
      readonly id: string | null;
      readonly surface: FormBlockSurface;
      readonly screenKey: string | null;
      readonly body: BuilderText;
    }): Promise<string> {
      const id = await saveFormBlock(supabase, block);
      await reload();
      return id;
    },
    async removeBlock(id: string): Promise<void> {
      await removeFormBlock(supabase, id);
      await reload();
    },
    /** Adds a consent to Dades legals, or renames and rewords one (RAPP-699). */
    async saveConsent(consent: {
      readonly id: string | null;
      readonly name: BuilderText;
      readonly body: BuilderText;
    }): Promise<string> {
      const id = await saveConsent(supabase, consent);
      await reload();
      return id;
    },
    async archiveConsent(id: string, archived: boolean): Promise<void> {
      await archiveConsent(supabase, id, archived);
      await reload();
    },
    /** Asks consents on the authorization or an Onboarding screen, optional at first. */
    async placeConsents(
      surface: ConsentSurface,
      screenKey: string | null,
      consentIds: readonly string[],
    ): Promise<void> {
      try {
        for (const consentId of consentIds) {
          await placeConsent(supabase, { consentId, surface, screenKey, required: false });
        }
      } finally {
        await reload();
      }
    },
    async saveConsentPlacement(placementId: string, required: boolean): Promise<void> {
      await saveConsentPlacement(supabase, placementId, required);
      await reload();
    },
    async removeConsentPlacement(placementId: string): Promise<void> {
      await removeConsentPlacement(supabase, placementId);
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
