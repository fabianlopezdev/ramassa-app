import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

export type PublishMode = 'draft' | 'now' | 'scheduled';

export interface ScheduledPublishFieldsProps {
  readonly mode: PublishMode;
  readonly publishedAt: string;
  readonly expiresAt: string;
  readonly onModeChange: (mode: PublishMode) => void;
  readonly onPublishedAtChange: (value: string) => void;
  readonly onExpiresAtChange: (value: string) => void;
}

export function ScheduledPublishFields({
  mode,
  publishedAt,
  expiresAt,
  onModeChange,
  onPublishedAtChange,
  onExpiresAtChange,
}: ScheduledPublishFieldsProps) {
  const { t } = useTranslation('announcements');

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
      <legend className="px-1 text-sm font-medium">{t('modeLabel')}</legend>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('modeLabel')}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="announcement-mode"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as PublishMode)}
        >
          <option value="draft">{t('modeDraft')}</option>
          <option value="now">{t('modeNow')}</option>
          <option value="scheduled">{t('modeScheduled')}</option>
        </select>
      </label>

      {mode === 'scheduled' ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('publishedAt')}</span>
          <Input
            type="datetime-local"
            data-testid="announcement-published-at"
            value={publishedAt}
            onChange={(event) => onPublishedAtChange(event.target.value)}
          />
        </label>
      ) : null}

      {mode !== 'draft' ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('expiresAt')}</span>
          <Input
            type="datetime-local"
            data-testid="announcement-expires-at"
            value={expiresAt}
            onChange={(event) => onExpiresAtChange(event.target.value)}
          />
        </label>
      ) : null}
    </fieldset>
  );
}
