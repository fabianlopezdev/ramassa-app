/**
 * Her consents on her page (RAPP-699): the current state of each consent, a
 * short history, and the staff recording on paper or as a withdrawal.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { ParticipantConsent } from '@ramassa/shared/authorization';
import type { Consent } from '@ramassa/shared/intake-builder';
import { consentRows, ParticipantConsents, type ConsentRecording } from './participant-consents';

const HEALTH = '00000000-0000-4000-8000-000000000001';
const NEWS = '00000000-0000-4000-8000-000000000002';
const GONE = '00000000-0000-4000-8000-000000000003';

const catalogue: Consent[] = [
  {
    id: HEALTH,
    key: 'health_data',
    systemKey: 'health_data',
    name: { ca: 'Dades de salut' },
    body: { ca: 'Accepto.' },
    isArchived: false,
  },
  {
    id: NEWS,
    key: 'newsletter',
    systemKey: 'newsletter',
    name: { ca: 'Butlletí' },
    body: { ca: 'Vull el butlletí.' },
    isArchived: false,
  },
];

function decision(overrides: Partial<ParticipantConsent>): ParticipantConsent {
  return {
    key: 'health_data',
    consentId: HEALTH,
    name: { ca: 'Dades de salut' },
    granted: true,
    decidedAt: '2026-09-20T16:30:00Z',
    method: 'app',
    form: 'authorization',
    wording: 'أوافق.',
    language: 'ar',
    required: true,
    seasonName: '2026/27',
    versionNumber: 1,
    recordedByName: null,
    reason: null,
    ...overrides,
  };
}

const history: ParticipantConsent[] = [
  decision({
    granted: false,
    decidedAt: '2026-10-02T16:00:00Z',
    method: 'staff',
    form: null,
    wording: null,
    versionNumber: null,
    seasonName: null,
    recordedByName: 'Marta Puig',
    reason: 'Ho va demanar a l’entrenament.',
  }),
  decision({}),
  decision({
    key: 'old_trips',
    consentId: GONE,
    name: { ca: 'Sortides antigues' },
    decidedAt: '2026-09-01T10:00:00Z',
    form: 'onboarding',
    versionNumber: null,
  }),
];

test('each consent of the catalogue, then one she decided that left it', () => {
  const rows = consentRows(history, catalogue, 'ca');
  expect(rows.map((row) => `${row.name}:${row.history.length}`)).toEqual([
    'Dades de salut:2',
    'Butlletí:0',
    'Sortides antigues:1',
  ]);
});

test('the current state is the latest decision, with a short history', () => {
  const view = render(
    <ParticipantConsents
      history={history}
      catalogue={catalogue}
      canRecord={false}
      onRecord={mock()}
    />,
  );
  const health = view.getByTestId('participant-consent-health_data');
  expect(health.textContent).toContain('consents.notGranted');
  expect(health.textContent).toContain('Marta Puig');
  expect(health.textContent).toContain('Ho va demanar a l’entrenament.');
  expect(health.textContent).toContain(' · staff · ');
  expect(view.getByTestId('participant-consent-newsletter').textContent).toContain(
    'consents.undecided',
  );
  expect(view.queryByTestId('participant-consent-paper-health_data')).toBeNull();
});

test('staff withdraw a consent with its reason, and are warned about her health answer', async () => {
  const onRecord = mock<(recording: ConsentRecording) => Promise<void>>(async () => undefined);
  const granted = [decision({})];
  const view = render(
    <ParticipantConsents history={granted} catalogue={catalogue} canRecord onRecord={onRecord} />,
  );
  fireEvent.click(view.getByTestId('participant-consent-withdraw-health_data'));
  const dialog = await waitFor(() => view.getByRole('dialog'));
  expect(view.getByTestId('consent-health-warning')).toBeTruthy();
  const reason = dialog.querySelector('textarea[name="consent-reason"]') as HTMLTextAreaElement;
  fireEvent.change(reason, { target: { value: 'Ho va demanar.' } });
  fireEvent.click(view.getByTestId('consent-record-save'));
  await waitFor(() =>
    expect(onRecord).toHaveBeenCalledWith({
      consentId: HEALTH,
      granted: false,
      method: 'staff',
      reason: 'Ho va demanar.',
      decidedOn: null,
    }),
  );
});

test('staff record a paper decision with its date', async () => {
  const onRecord = mock<(recording: ConsentRecording) => Promise<void>>(async () => undefined);
  const view = render(
    <ParticipantConsents history={[]} catalogue={catalogue} canRecord onRecord={onRecord} />,
  );
  fireEvent.click(view.getByTestId('participant-consent-paper-newsletter'));
  const dialog = await waitFor(() => view.getByRole('dialog'));
  expect(view.queryByTestId('consent-health-warning')).toBeNull();
  const date = dialog.querySelector('input[name="consent-decided-on"]') as HTMLInputElement;
  fireEvent.change(date, { target: { value: '2026-09-15' } });
  fireEvent.click(view.getByTestId('consent-record-save'));
  await waitFor(() =>
    expect(onRecord).toHaveBeenCalledWith({
      consentId: NEWS,
      granted: true,
      method: 'paper',
      reason: null,
      decidedOn: '2026-09-15',
    }),
  );
});
