/**
 * Marks a team account as a test account (RAPP-615). A test account signs in
 * with the fixed code of the staging environment (RAPP-616), so only the
 * accounts that run tests carry it. The box always shows what the database
 * holds: it changes when the save succeeds and the list is read again.
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TeamTestAccountToggle({
  name,
  isTestAccount,
  onChange,
}: {
  readonly name: string;
  readonly isTestAccount: boolean;
  readonly onChange: (isTestAccount: boolean) => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const helpId = useId();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: boolean) {
    setSaving(true);
    setFailed(false);
    try {
      await onChange(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="mt-1 inline-flex flex-col gap-1">
      <label className="inline-flex items-center gap-2 text-xs" title={t('team.testAccountHelp')}>
        <input
          type="checkbox"
          className="size-4"
          checked={isTestAccount}
          disabled={saving}
          aria-label={t('team.testAccountFor', { name })}
          aria-describedby={helpId}
          onChange={(event) => void change(event.target.checked)}
        />
        <span>{t('team.testAccount')}</span>
      </label>
      <span id={helpId} className="sr-only">
        {t('team.testAccountHelp')}
      </span>
      {failed ? (
        <span role="alert" className="text-xs text-destructive">
          {t('team.testAccountFailed')}
        </span>
      ) : null}
    </span>
  );
}
