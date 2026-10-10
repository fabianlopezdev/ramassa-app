import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { StaffMember } from '@ramassa/shared/organization-settings';
import type {
  PermissionCode,
  PermissionPreset,
  TeamMemberAccess,
} from '@ramassa/shared/permissions';
import { BUILTIN_PRESET_DEFAULTS } from '@ramassa/shared/permissions';
import { TeamAccessPanel } from './team-access-panel';

const coach: PermissionPreset = {
  id: '29000000-0000-4000-8000-000000000001',
  builtinKey: 'coach',
  name: null,
  permissions: new Set(BUILTIN_PRESET_DEFAULTS.coach),
};
const admin: PermissionPreset = {
  id: '29000000-0000-4000-8000-000000000003',
  builtinKey: 'admin',
  name: null,
  permissions: new Set(BUILTIN_PRESET_DEFAULTS.admin),
};

const nuria: StaffMember = {
  profile_id: '5eed0000-0000-4000-8000-000000000002',
  first_name: 'Núria',
  last_name: 'Soler',
  email: 'nuria@example.test',
  role: 'staff',
  is_active: true,
  invited_at: '2026-08-22T10:00:00Z',
};

const nuriaAsAdjustedCoach: TeamMemberAccess = {
  profileId: nuria.profile_id,
  presetId: coach.id,
  permissions: new Set<PermissionCode>([...BUILTIN_PRESET_DEFAULTS.coach, 'feedback.view']),
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof TeamAccessPanel>> = {}) {
  const props: React.ComponentProps<typeof TeamAccessPanel> = {
    members: [nuria],
    access: [nuriaAsAdjustedCoach],
    presets: [coach, admin],
    myPermissions: new Set(BUILTIN_PRESET_DEFAULTS.admin),
    onInvite: mock(async () => undefined),
    onSaveMemberAccess: mock(async () => undefined),
    onSavePreset: mock(async () => coach.id),
    onApplyPreset: mock(async () => undefined),
    onDeletePreset: mock(async () => undefined),
    onRestorePreset: mock(async () => undefined),
    onRemove: mock(async () => undefined),
    ...overrides,
  };
  return { props, view: render(<TeamAccessPanel {...props} />) };
}

test('a person whose toggles differ from her preset reads as that preset, adjusted', () => {
  const { view } = renderPanel();
  expect(view.getByTestId(`team-access-${nuria.profile_id}`).textContent).toMatch(/adjusted/);
});

test('removing a team member asks for confirmation first', async () => {
  const { props, view } = renderPanel();
  fireEvent.click(view.getByRole('button', { name: /removeFor|Remove/ }));
  expect(props.onRemove).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: /^confirm$|Confirm/ }));
  await waitFor(() => expect(props.onRemove).toHaveBeenCalledWith(nuria.profile_id));
});

test('editing access applies a preset, then saves the toggles with that preset', async () => {
  const { props, view } = renderPanel();
  fireEvent.click(view.getByRole('button', { name: /editAccessFor|Edit access/ }));
  const dialog = within(view.getByRole('dialog'));
  expect((dialog.getByTestId('permission-feedback.view') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(dialog.getByRole('button', { name: /usePreset|Use this preset/ }));
  expect((dialog.getByTestId('permission-feedback.view') as HTMLInputElement).checked).toBe(false);
  fireEvent.click(dialog.getByRole('button', { name: /^save$|Save/ }));
  await waitFor(() => expect(props.onSaveMemberAccess).toHaveBeenCalledTimes(1));
  const saved = (props.onSaveMemberAccess as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
    permissions: ReadonlySet<PermissionCode>;
    presetId: string | null;
  };
  expect([...saved.permissions].sort()).toEqual([...BUILTIN_PRESET_DEFAULTS.coach].sort());
  expect(saved.presetId).toBe(coach.id);
});

test('a toggle the reader does not hold is shown but locked', () => {
  const { view } = renderPanel({ myPermissions: new Set(['team.manage', 'attendance.mark']) });
  fireEvent.click(view.getByRole('button', { name: /editAccessFor|Edit access/ }));
  const dialog = within(view.getByRole('dialog'));
  expect((dialog.getByTestId('permission-feedback.view') as HTMLInputElement).disabled).toBe(true);
  expect((dialog.getByTestId('permission-attendance.mark') as HTMLInputElement).disabled).toBe(
    false,
  );
  expect(dialog.getByText(/lockedHint|only change/)).not.toBeNull();
});

test('an area switch turns on every permission in the area', () => {
  const { view } = renderPanel();
  fireEvent.click(view.getByRole('button', { name: /editAccessFor|Edit access/ }));
  const dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByTestId('permission-area-material'));
  for (const code of [
    'equipment.handover',
    'equipment.receive',
    'equipment.count',
    'equipment.items',
  ]) {
    expect((dialog.getByTestId(`permission-${code}`) as HTMLInputElement).checked).toBe(true);
  }
});

test('saving a preset that people use asks whether to apply it, and applies to everyone', async () => {
  const { props, view } = renderPanel();
  fireEvent.click(view.getAllByRole('button', { name: /editPresetFor|Edit preset/ })[0]!);
  const dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: /^save$|Save/ }));
  await waitFor(() => expect(props.onSavePreset).toHaveBeenCalledTimes(1));
  expect(props.onApplyPreset).not.toHaveBeenCalled();
  const apply = within(await view.findByRole('dialog'));
  fireEvent.click(apply.getByRole('button', { name: /^confirm$|Confirm/ }));
  await waitFor(() =>
    expect(props.onApplyPreset).toHaveBeenCalledWith(coach.id, [nuria.profile_id]),
  );
});

test('the database refusing the last team manager reads as plain words', async () => {
  const { view } = renderPanel({
    onSaveMemberAccess: mock(async () => {
      throw new Error('PERMISSIONS/LAST_TEAM_MANAGER');
    }),
  });
  fireEvent.click(view.getByRole('button', { name: /editAccessFor|Edit access/ }));
  const dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByTestId('permission-forum.moderate'));
  fireEvent.click(dialog.getByRole('button', { name: /^save$|Save/ }));
  await waitFor(() =>
    expect(view.getByRole('alert').textContent).toMatch(/errorLastManager|team\.manage|last/),
  );
});
