/**
 * One field of the Fitxa (RAPP-650): grip, type, name, its type and who
 * created it, its privacy, where it is asked, then a lock on a built-in field
 * (the app fixes its type and privacy) or Edit on a Ramassà one.
 *
 * Every row has one height and fixed columns, so names, badges and chips line
 * up down a section and across sections, whether a row ends in a lock, a
 * button or nothing (a reader who cannot edit).
 */

import { FieldTypeIcon } from '@/components/fields/field-type-icon';
import { PrivacyBadge } from '@/components/fields/privacy-badge';
import { SurfaceChips } from '@/components/fields/surface-chips';
import { DragHandle, type SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GripVertical, Lock } from 'lucide-react';
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

/** The grip's place: the grip itself, a still copy on the lifted row, or room for one. */
function GripSlot({
  handle,
  label,
  isLifted,
}: {
  readonly handle: SortableHandle | null;
  readonly label: string;
  readonly isLifted: boolean;
}) {
  if (handle !== null) return <DragHandle handle={handle} label={label} />;
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center text-muted-foreground"
    >
      {isLifted ? <GripVertical className="size-4" /> : null}
    </span>
  );
}

export function ProfileFieldRow({
  field,
  surfaces,
  handle,
  canEdit,
  onEdit,
  isLifted = false,
}: {
  readonly field: ProfileField;
  readonly surfaces: readonly ProfileSurface[];
  /** The grip; null when the row does not move (a reader, or the lifted copy). */
  readonly handle: SortableHandle | null;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
  readonly isLifted?: boolean;
}) {
  const { t, i18n } = useTranslation('settings');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const name = textIn(field.label, locale as LanguageCode);
  const origin =
    field.kind === 'builtin'
      ? t('profileLayout.fromApp')
      : field.createdByName === null
        ? t('profileLayout.createdOn', { date: shortDate(field.createdAt, locale) })
        : t('profileLayout.createdBy', {
            name: field.createdByName,
            date: shortDate(field.createdAt, locale),
          });
  return (
    <div
      className={cn(
        'flex h-16 items-center gap-3 px-5',
        isLifted && 'rounded-lg border bg-card shadow-xl ring-2 ring-primary',
      )}
      data-testid={`profile-field-${field.id}`}
    >
      <GripSlot
        handle={handle}
        label={t('profileLayout.moveField', { field: name })}
        isLifted={isLifted}
      />
      <FieldTypeIcon type={field.type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-start text-sm font-medium">{name}</p>
        <p className="truncate text-start text-xs text-muted-foreground">
          {t(`questions.types.${field.type}`)} · {origin}
        </p>
      </div>
      <span className="flex w-20 shrink-0 justify-start">
        <PrivacyBadge level={field.privacy} />
      </span>
      <SurfaceChips surfaces={surfaces} className="hidden w-56 shrink-0 md:flex" />
      <span className="flex w-16 shrink-0 justify-end">
        {field.kind === 'builtin' ? (
          <span
            className="flex size-7 items-center justify-center text-muted-foreground"
            title={t('profileLayout.builtinLock')}
          >
            <Lock aria-hidden className="size-4" />
            <span className="sr-only">{t('profileLayout.builtinLock')}</span>
          </span>
        ) : canEdit ? (
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
