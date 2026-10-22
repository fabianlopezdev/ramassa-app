import { useTranslation } from 'react-i18next';

/**
 * The required switch next to a question (RAPP-611). It saves at once; a
 * locked one says why in plain words.
 */
export function RequiredSwitch({
  id,
  checked,
  lockReason,
  note,
  disabled,
  onChange,
  label,
}: {
  readonly id: string;
  readonly checked: boolean;
  readonly lockReason?: string;
  readonly note?: string;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
  /** The switch's words; "Required" when left out. */
  readonly label?: string;
}) {
  const { t } = useTranslation('settings');
  const describedBy = [lockReason ? `${id}-lock` : null, note ? `${id}-note` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-2 text-start text-xs font-medium">
        <input
          id={id}
          type="checkbox"
          data-testid={id}
          checked={checked}
          disabled={disabled || lockReason !== undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label ?? t('questions.requiredSwitch')}</span>
      </label>
      {lockReason === undefined ? null : (
        <p id={`${id}-lock`} className="text-start text-xs text-muted-foreground">
          {lockReason}
        </p>
      )}
      {note === undefined ? null : (
        <p id={`${id}-note`} className="text-start text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
