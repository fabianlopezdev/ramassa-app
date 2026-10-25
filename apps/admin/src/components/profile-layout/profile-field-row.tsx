/**
 * One field of Dades de les jugadores (RAPP-650): type, name, its type and who
 * created it (nothing for the fields Ramassà started with), its privacy, where
 * it is asked, then Edit. Every field opens with Edit (RAPP-665). Rows do not
 * move (RAPP-658).
 *
 * Every row has one height and fixed columns, so names, badges and chips line
 * up down a section and across sections.
 */

import { FieldTypeIcon } from '@/components/fields/field-type-icon';
import { PrivacyBadge } from '@/components/fields/privacy-badge';
import { SurfaceChips } from '@/components/fields/surface-chips';
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
    <div className="flex h-16 items-center gap-3 px-5" data-testid={`profile-field-${field.id}`}>
      <FieldTypeIcon type={field.type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-start text-sm font-medium">{name}</p>
        <p className="truncate text-start text-xs text-muted-foreground">
          {[t(`questions.types.${field.type}`), origin].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="flex w-20 shrink-0 justify-start">
        <PrivacyBadge level={field.privacy} />
      </span>
      <SurfaceChips surfaces={surfaces} className="hidden w-56 shrink-0 md:flex" />
      <span className="flex w-36 shrink-0 justify-end">
        {canEdit ? (
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
        ) : null}
      </span>
    </div>
  );
}
