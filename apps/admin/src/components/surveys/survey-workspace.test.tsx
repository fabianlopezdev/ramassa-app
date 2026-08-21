import { createAdminI18n } from '@/lib/i18n';
import { fireEvent, render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import { SurveyWorkspace } from './survey-workspace';

test('survey workspace exposes a translated builder, reusable audience picker, and visual question types', () => {
  const view = render(
    <I18nextProvider i18n={createAdminI18n('en')}>
      <SurveyWorkspace
        surveys={[]}
        groups={[]}
        options={{
          serviceCategories: [],
          events: [],
          entities: [],
          participants: [],
        }}
        onRefresh={async () => undefined}
      />
    </I18nextProvider>,
  );

  expect(view.getByRole('heading', { level: 1 })).not.toBeNull();
  const audienceKind = view.getByTestId('survey-audience-kind');
  fireEvent.change(audienceKind, { target: { value: 'interest' } });
  expect(view.getByTestId('survey-audience-value')).not.toBeNull();
  expect(view.getByTestId('survey-question-0')).not.toBeNull();
  for (const type of ['rating', 'multiple_choice', 'yes_no', 'free_text']) {
    expect(view.container.querySelector(`option[value="${type}"]`)).not.toBeNull();
  }
  expect(
    [...view.container.querySelectorAll('button')].filter((button) =>
      /Generate translations|generateTranslations/.test(button.textContent ?? ''),
    ).length,
  ).toBe(2);
});
