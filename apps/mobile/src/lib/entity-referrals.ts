/**
 * The partner entity's referrals on the phone (RAPP-413), as the web portal's
 * referrals pages: the women her entity referred with their status, one
 * referral with its updates, a new referral, and an update the entity shares
 * with the team. The database scopes every row to her own entity. Kept in
 * memory: referrals hold contact details.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import {
  entityFormFallbackItems,
  entityFormItemsOf,
  fetchIntakeCatalog,
  fetchSystemFieldIndex,
  systemFieldsOf,
  type EntityFormItem,
  type SystemFieldIndex,
} from '@ramassa/shared/intake-builder';
import {
  fetchEntityReferrals,
  fetchReferralRecord,
  fetchReferralUpdates,
  fetchSupportingEntityNames,
  referralAppAnswers,
  sendReferral,
  submitReferralUpdate,
  type CreateReferral,
  type ReferralFieldAnswers,
  type ReferralUpdateInput,
} from '@ramassa/shared/referrals';
import { logger } from './observability';
import { supabase } from './supabase';

const referralsRoot = (userId: string) => ['entity', userId, 'referrals'] as const;

export function useEntityReferrals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...referralsRoot(user?.id ?? 'signed-out'), 'list'],
    queryFn: () => fetchEntityReferrals(supabase),
    enabled: user !== null,
  });
}

export function useEntityReferral(referralId: string) {
  const { user } = useAuth();
  const root = referralsRoot(user?.id ?? 'signed-out');
  const referral = useQuery({
    queryKey: [...root, 'detail', referralId],
    // The entity's answers by field, with the fields to read them by (RAPP-663).
    queryFn: () => fetchReferralRecord(supabase, referralId),
    enabled: user !== null,
  });
  const updates = useQuery({
    queryKey: [...root, 'updates', referralId],
    queryFn: () => fetchReferralUpdates(supabase, referralId),
    enabled: user !== null,
  });
  return { referral, updates };
}

/** The organization's partner entities by name, for the referral form (RAPP-303). */
export function useSupportingEntityNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['supporting-entity-names', user?.id ?? 'signed-out'],
    queryFn: () => fetchSupportingEntityNames(supabase),
    enabled: user !== null,
  });
}

/** The referral form: its items, and the app's fields its answers are saved by. */
export interface ReferralForm {
  readonly items: readonly EntityFormItem[];
  /** Empty when the catalog could not load: the save reads them again. */
  readonly fields: SystemFieldIndex;
}

/**
 * The fields staff placed on the referral form (RAPP-652, RAPP-655), in their
 * order and worded for the entity, as the web portal draws them, and the
 * app's fields by system key (RAPP-663). When the catalog cannot load, the
 * form asks the app's own fields, her names required, as it did before staff
 * could place any, and the failure is logged.
 */
export function useReferralFormItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['referral-form-items', user?.id ?? 'signed-out'],
    queryFn: async (): Promise<ReferralForm> => {
      try {
        const catalog = await fetchIntakeCatalog(supabase);
        return {
          items:
            catalog.layout === undefined ? entityFormFallbackItems() : entityFormItemsOf(catalog),
          fields: systemFieldsOf(catalog),
        };
      } catch (error) {
        logger.warn('entity_referral.form_load_failed', { error: toAppError(error) });
        return { items: entityFormFallbackItems(), fields: new Map() };
      }
    },
    enabled: user !== null,
  });
}

export function useReferralActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: referralsRoot(user?.id ?? 'signed-out') });
  // Every answer travels by field with the referral in one call (RAPP-663), so
  // it is never saved without them, and the database checks the required ones.
  const create = useMutation({
    mutationFn: async (input: {
      readonly referral: CreateReferral;
      /** The answers to Ramassà's fields. */
      readonly custom: ReferralFieldAnswers;
      readonly fields: SystemFieldIndex;
    }) => {
      const fields = input.fields.size > 0 ? input.fields : await fetchSystemFieldIndex(supabase);
      return sendReferral(supabase, input.referral, {
        ...referralAppAnswers(fields, input.referral),
        ...input.custom,
      });
    },
    onSuccess: refresh,
  });
  const addUpdate = useMutation({
    mutationFn: (input: { readonly referralId: string; readonly update: ReferralUpdateInput }) =>
      submitReferralUpdate(supabase, input.referralId, input.update),
    onSuccess: refresh,
  });
  return { create, addUpdate };
}
