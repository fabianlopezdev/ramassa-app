/**
 * The web build's calendar date field (RAPP-344): one `date` input, because
 * the native picker draws nothing on the web.
 */
import type { CSSProperties } from 'react';
import type { DateFieldProps } from './date-field';

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

export function DateField({ testID, label, value, onChange }: DateFieldProps) {
  return (
    <label htmlFor={testID} dir="auto" style={labelStyle}>
      {label}
      <input
        id={testID}
        data-testid={testID}
        type="date"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={inputStyle}
      />
    </label>
  );
}
