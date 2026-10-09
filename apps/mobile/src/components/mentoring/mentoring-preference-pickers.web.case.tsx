import { render } from '@testing-library/react';
import { afterAll, expect, mock, test } from 'bun:test';
import { createElement } from 'react';

mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterAll(() => mock.restore());

const { MentoringPreferencePickers } = await import('./mentoring-preference-pickers.web');
const noChange = () => undefined;
const picker = (preferredDate: string, preferredTime: string) =>
  createElement(MentoringPreferencePickers, {
    preferredDate,
    preferredTime,
    onPreferredDateChange: noChange,
    onPreferredTimeChange: noChange,
  });

test('the guided controls keep time optional and dependent on a selected date', () => {
  const view = render(picker('', ''));
  let date = view.getByTestId('mentoring-preferred-date') as HTMLInputElement;
  let time = view.getByTestId('mentoring-preferred-time') as HTMLInputElement;

  expect({ dateType: date.type, timeType: time.type }).toEqual({
    dateType: 'date',
    timeType: 'time',
  });
  expect(time.disabled).toBe(true);

  view.rerender(picker('2026-08-05', '07:04'));
  date = view.getByTestId('mentoring-preferred-date') as HTMLInputElement;
  time = view.getByTestId('mentoring-preferred-time') as HTMLInputElement;
  expect(time.disabled).toBe(false);
  expect({ date: date.value, time: time.value }).toEqual({
    date: '2026-08-05',
    time: '07:04',
  });

  view.rerender(picker('', ''));
  date = view.getByTestId('mentoring-preferred-date') as HTMLInputElement;
  time = view.getByTestId('mentoring-preferred-time') as HTMLInputElement;
  expect({ date: date.value, time: time.value, timeDisabled: time.disabled }).toEqual({
    date: '',
    time: '',
    timeDisabled: true,
  });
});
