/**
 * The Fitxa de la jugadora's changes (RAPP-650): each one written through the
 * database's own function (RAPP-649), then the route reloads, as the
 * onboarding editor does.
 */

import type { FieldFormDraft } from '@/components/fields/field-form';
import { supabase } from '@/lib/supabase';
import { useRouter } from '@tanstack/react-router';
import {
  archiveProfileField,
  moveProfileField,
  profileFieldAnswerCount,
  reorderProfileSections,
  saveProfileField,
  saveProfileSection,
  type BuilderText,
  type ProfileField,
  type ProfileSection,
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
    ): Promise<void> {
      await saveProfileField(supabase, {
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
  };
}

export type ProfileLayoutActions = ReturnType<typeof useProfileLayoutActions>;
