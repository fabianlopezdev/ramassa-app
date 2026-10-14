/**
 * The web build's date-and-time field (RAPP-341): one `datetime-local` input,
 * because the native picker draws nothing on the web.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateTimeFieldProps } from './date-time-field';
import { fromLocalInputValue, toLocalInputValue } from './date-time-value';

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

export function DateTimeField({
  testID,
  label,
  value,
  onChange,
  emptyLabel,
  inMadridTime = false,
}: DateTimeFieldProps) {
  const { t } = useTranslation('announcements');
  return (
    <div dir="auto" style={{ display: 'grid', gap: 8 }}>
      <label htmlFor={testID} style={labelStyle}>
        {label}
        <input
          id={testID}
          data-testid={testID}
          type="datetime-local"
          value={toLocalInputValue(value, inMadridTime)}
          onChange={(event) =>
            onChange(fromLocalInputValue(event.currentTarget.value, inMadridTime))
          }
          style={inputStyle}
        />
      </label>
      {value === null && emptyLabel !== undefined ? <span>{emptyLabel}</span> : null}
      {value !== null && emptyLabel !== undefined ? (
        <button type="button" data-testid={`${testID}-clear`} onClick={() => onChange(null)}>
          {t('clearDate')}
        </button>
      ) : null}
    </div>
  );
}
