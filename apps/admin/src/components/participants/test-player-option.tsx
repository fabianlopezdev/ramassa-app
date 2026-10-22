/**
 * The "Test player" option of the invitation form (RAPP-615). A test player is
 * made up, to try the registration: she signs in with the staging fixed code
 * (RAPP-616) and can be deleted outright (RAPP-617). Whoever creates test
 * players only has the option on and locked, as the database requires.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export function TestPlayerOption({
  mode,
  checked,
  onChange,
}: {
  readonly mode: 'optional' | 'forced';
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation('participants');
  const helpId = useId();
  const forced = mode === 'forced';
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-4" data-testid="test-player-option">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="is-test-account"
          className="size-4"
          checked={forced || checked}
          disabled={forced}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{t('testPlayerOption')}</span>
      </label>
      <p id={helpId} className="text-start text-sm text-muted-foreground">
        {forced ? t('testPlayerForcedHelp') : t('testPlayerOptionHelp')}
      </p>
    </div>
  );
}
