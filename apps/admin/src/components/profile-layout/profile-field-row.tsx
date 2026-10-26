/**
 * One field of Dades de les jugadores (RAPP-650): type, name, its type and who
 * created it (nothing for the fields Ramassà started with), its privacy, where
 * it is asked, then Edit. Every field opens with Edit (RAPP-665). Rows do not
 * move (RAPP-658).
 *
 * Drawn with the catalogue row Dades legals shares (RAPP-699).
 */

import { PrivacyBadge } from '@/components/fields/privacy-badge';
import { CatalogRow } from '@/components/profile-layout/catalog-row';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { textIn, type ProfileField, type ProfileSurface } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** "23 Oct", with the year when it is not this one. */
export function shortDate(iso: string, locale: string, now = new Date()): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export function ProfileFieldRow({
  field,
  surfaces,
  canEdit,
  onEdit,
}: {
  readonly field: ProfileField;
  readonly surfaces: readonly ProfileSurface[];
  readonly canEdit: boolean;
  readonly onEdit: () => void;
}) {
  const { t, i18n } = useTranslation('settings');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const name = textIn(field.label, locale as LanguageCode);
  const date = shortDate(field.createdAt, locale);
  const origin =
    field.kind === 'builtin'
      ? null
      : field.createdByName === null
        ? t('profileLayout.createdOn', { date })
        : t('profileLayout.createdBy', { name: field.createdByName, date });
  return (
    <CatalogRow
      type={field.type}
      name={name}
      detail={[t(`questions.types.${field.type}`), origin].filter(Boolean).join(' · ')}
      badge={<PrivacyBadge level={field.privacy} />}
      surfaces={surfaces}
      action={
        canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            aria-label={t('profileLayout.editNamed', { field: name })}
            data-testid={`profile-field-edit-${field.id}`}
          >
            {t('questions.edit')}
          </Button>
        ) : null
      }
      testId={`profile-field-${field.id}`}
    />
  );
}
