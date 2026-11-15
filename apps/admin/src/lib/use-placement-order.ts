/**
 * The saved order of a surface's items (RAPP-651, RAPP-652): an onboarding
 * screen's fields, the entity form's, and their signature blocks (RAPP-690),
 * which share one order with the fields. A drop shows the new order at once
 * and puts the old one back, with a toast, when saving fails.
 */

import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ProfileSurface } from '@ramassa/shared/intake-builder';

export function usePlacementOrder<Row>(
  surface: ProfileSurface,
  screenKey: string | null,
  placed: readonly Row[],
  /** A placement's id, or a block's. */
  idOf: (row: Row) => string,
) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const ids = placed.map(idOf);
  const [order, setOrder] = useState<readonly string[]>(ids);
  // A field added or removed since: the saved order again.
  const ordered =
    [...order].sort().join() === [...ids].sort().join()
      ? order.flatMap((id) => placed.filter((row) => idOf(row) === id))
      : placed;
  async function reorder(next: readonly string[]) {
    const previous = order;
    setOrder(next);
    try {
      await actions.reorderPlacements(surface, screenKey, next);
    } catch {
      setOrder(previous);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }
  return { ordered, reorder };
}
