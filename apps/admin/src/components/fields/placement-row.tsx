/**
 * One field placed on a surface (RAPP-651): the onboarding screen editor's
 * Questions list, and the entity form editor's (RAPP-652). Grip, type, the
 * field's name, its section on Dades de les jugadores ("Talles"), its privacy,
 * Required for this surface, Edit, and remove (×), which takes the field off
 * the surface and never deletes it. Edit opens the row's own panel under it
 * (`children`): the wording for this surface, or a built-in's reword form.
 *
 * Every row has the same columns, so names, badges and switches line up
 * whether a row moves (a grip) or not (room for one), and whether it can be
 * removed (×) or not (room for one).
 */

import { FieldTypeIcon } from '@/components/fields/field-type-icon';
import { PrivacyBadge } from '@/components/fields/privacy-badge';
import { DragHandle, type SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomQuestionType, QuestionPrivacy } from '@ramassa/shared/intake-builder';

/** "Required" as a switch that saves at once (RAPP-611); a locked one says why. */
function RequiredToggle({
  id,
  checked,
  lockReason,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly lockReason: string | undefined;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex shrink-0 items-center gap-2" title={lockReason}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || lockReason !== undefined}
        onCheckedChange={onChange}
        aria-describedby={lockReason === undefined ? undefined : `${id}-lock`}
        data-testid={id}
      />
      <label htmlFor={id} className="sr-only text-xs font-medium whitespace-nowrap sm:not-sr-only">
        {t('questions.requiredSwitch')}
      </label>
      {lockReason === undefined ? null : (
        <span id={`${id}-lock`} className="sr-only">
          {lockReason}
        </span>
      )}
    </div>
  );
}

export interface PlacementRowProps {
  /** The name the team reads: the field's, or a built-in's reword. */
  readonly name: string;
  /** The line under the name: where the field comes from, and its section. */
  readonly detail: string;
  readonly type: CustomQuestionType;
  readonly privacy: QuestionPrivacy;
  /** The grip; null for a row that keeps its place (an app screen's own questions). */
  readonly handle: SortableHandle | null;
  readonly required: {
    readonly id: string;
    readonly checked: boolean;
    readonly lockReason?: string;
    readonly onChange: (next: boolean) => void;
  };
  readonly isBusy: boolean;
  readonly isEditing: boolean;
  /** Opens or closes the row's panel. */
  readonly onToggleEdit: () => void;
  /** Takes the field off the surface; left out when the surface keeps it. */
  readonly onRemove?: () => void;
  /** The remove button's name; "take it off the screen" when left out. */
  readonly removeLabel?: string;
  /** The panel under the row while editing. */
  readonly children?: ReactNode;
  readonly testId: string;
}

export function PlacementRow({
  name,
  detail,
  type,
  privacy,
  handle,
  required,
  isBusy,
  isEditing,
  onToggleEdit,
  onRemove,
  removeLabel,
  children,
  testId,
}: PlacementRowProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex flex-col" data-testid={testId}>
      <div className="flex min-h-16 items-center gap-3 px-3">
        {handle === null ? (
          <span aria-hidden className="size-7 shrink-0" />
        ) : (
          <DragHandle handle={handle} label={t('profileLayout.moveField', { field: name })} />
        )}
        <FieldTypeIcon type={type} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-start text-sm font-medium">{name}</p>
          <p className="truncate text-start text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="hidden w-20 shrink-0 justify-start sm:flex">
          <PrivacyBadge level={privacy} />
        </span>
        <RequiredToggle
          id={required.id}
          checked={required.checked}
          lockReason={required.lockReason}
          disabled={isBusy}
          onChange={required.onChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onToggleEdit}
          aria-expanded={isEditing}
          aria-label={t('profileLayout.editNamed', { field: name })}
          data-testid={`${testId}-edit`}
        >
          {t('questions.edit')}
        </Button>
        {onRemove === undefined ? (
          <span aria-hidden className="size-7 shrink-0" />
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            disabled={isBusy}
            aria-label={removeLabel ?? t('placement.removeNamed', { field: name })}
            onClick={onRemove}
            data-testid={`${testId}-remove`}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {isEditing && children !== undefined ? (
        <div className="border-t bg-muted/30 px-3 py-4 sm:ps-24">{children}</div>
      ) : null}
    </div>
  );
}
