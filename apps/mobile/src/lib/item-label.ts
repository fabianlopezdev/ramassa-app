/**
 * The name a person reads for an item (RAPP-253): a custom item's own name in
 * the app's language, or the translation of a built-in key. One place, so a
 * custom item never shows up as its key on any screen.
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { itemTypeLabel } from '@ramassa/shared/equipment';
import { useLanguage } from '@ramassa/shared/i18n';
import { useHandoverItemTypes } from './handover';

export function useItemLabel(): (key: string) => string {
  const { t } = useTranslation('equipment');
  const { language } = useLanguage();
  const types = useHandoverItemTypes().data;
  const byKey = useMemo(() => new Map((types ?? []).map((type) => [type.key, type])), [types]);
  return useCallback(
    (key: string) => itemTypeLabel(byKey.get(key), key, language, (value) => t(value)),
    [byKey, language, t],
  );
}
