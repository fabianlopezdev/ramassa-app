import type { ChangeEvent, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { MentoringPreferencePickersProps } from './mentoring-preference-pickers';

const groupStyle: CSSProperties = { display: 'grid', gap: 8, flex: '1 1 240px' };
const labelStyle: CSSProperties = { display: 'grid', gap: 8, fontWeight: 600 };
const inputStyle: CSSProperties = {
  minHeight: 48,
  border: '1px solid #A3A3A3',
  borderRadius: 8,
  background: '#FFFFFF',
  color: '#171717',
  font: 'inherit',
  padding: '0 12px',
};

export function MentoringPreferencePickers({
  preferredDate,
  preferredTime,
  onPreferredDateChange,
  onPreferredTimeChange,
}: MentoringPreferencePickersProps) {
  const { t } = useTranslation('mentoring');
  const changeDate = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    onPreferredDateChange(value);
    if (value.length === 0) onPreferredTimeChange('');
  };

  return (
    <div dir="auto" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <div style={groupStyle}>
        <label htmlFor="mentoring-preferred-date" style={labelStyle}>
          {t('mentoring:preferredDateLabel')}
          <input
            id="mentoring-preferred-date"
            data-testid="mentoring-preferred-date"
            type="date"
            value={preferredDate}
            onChange={changeDate}
            style={inputStyle}
          />
        </label>
        <span>
          {preferredDate.length === 0 ? t('mentoring:preferredNoPreference') : preferredDate}
        </span>
      </div>
      <div style={groupStyle}>
        <label htmlFor="mentoring-preferred-time" style={labelStyle}>
          {t('mentoring:preferredTimeLabel')}
          <input
            id="mentoring-preferred-time"
            data-testid="mentoring-preferred-time"
            type="time"
            value={preferredTime}
            disabled={preferredDate.length === 0}
            onChange={(event) => onPreferredTimeChange(event.currentTarget.value)}
            style={inputStyle}
          />
        </label>
        <span>
          {preferredDate.length === 0
            ? t('mentoring:preferredTimeNeedsDate')
            : preferredTime.length === 0
              ? t('mentoring:preferredNoPreference')
              : preferredTime}
        </span>
      </div>
    </div>
  );
}
