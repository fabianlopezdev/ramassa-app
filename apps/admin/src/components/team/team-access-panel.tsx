/**
 * The Team tab (RAPP-231): who is on the team, what each person may do, and the
 * presets that set it up quickly.
 *
 * Every rule lives in the database (RAPP-229): team.manage is required, nobody
 * changes a toggle they do not hold, the organization keeps at least one
 * team.manage holder, and every change is audited. This screen shows those
 * rules before the database has to refuse: a toggle the reader does not hold is
 * visible but locked, with the reason next to it.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffMember } from '@ramassa/shared/organization-settings';
import {
  membersUsingPreset,
  permissionsByArea,
  sameCodes,
  summarizeAccess,
  teamAccessErrorKey,
  type PermissionArea,
  type PermissionCode,
  type PermissionPreset,
  type TeamMemberAccess,
} from '@ramassa/shared/permissions';

export interface TeamAccessPanelProps {
  readonly members: readonly StaffMember[];
  readonly access: readonly TeamMemberAccess[];
  readonly presets: readonly PermissionPreset[];
  /** The reader's own permissions: a toggle she does not hold is locked. */
  readonly myPermissions: ReadonlySet<PermissionCode>;
  readonly onInvite: (input: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly presetId: string;
  }) => Promise<void>;
  readonly onSaveMemberAccess: (input: {
    readonly profileId: string;
    readonly permissions: ReadonlySet<PermissionCode>;
    readonly presetId: string | null;
  }) => Promise<void>;
  readonly onSavePreset: (input: {
    readonly presetId: string | null;
    readonly name: string | null;
    readonly permissions: ReadonlySet<PermissionCode>;
  }) => Promise<string>;
  readonly onApplyPreset: (presetId: string, profileIds: readonly string[]) => Promise<void>;
  readonly onDeletePreset: (presetId: string) => Promise<void>;
  readonly onRestorePreset: (presetId: string) => Promise<void>;
  readonly onRemove: (profileId: string) => Promise<void>;
  /** The reader's own id: nobody resets her own second factor (RAPP-233). */
  readonly currentUserId: string | null;
  readonly onResetSecondFactor: (profileId: string) => Promise<void>;
  /** Ends every session of the person at once (RAPP-234). */
  readonly onSignOutEverywhere: (profileId: string) => Promise<void>;
}

type Message = { readonly kind: 'success' | 'error'; readonly text: string };

/** i18next reads `.` as nesting, so a permission code is keyed with `_`. */
const permissionKey = (code: PermissionCode) => code.replace('.', '_');

export function TeamAccessPanel({
  members,
  access,
  presets,
  myPermissions,
  onInvite,
  onSaveMemberAccess,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onRestorePreset,
  onRemove,
  currentUserId,
  onResetSecondFactor,
  onSignOutEverywhere,
}: TeamAccessPanelProps) {
  const { t } = useTranslation('settings');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | 'new' | null>(null);
  const [applyPresetId, setApplyPresetId] = useState<string | null>(null);
  const [removeProfileId, setRemoveProfileId] = useState<string | null>(null);
  const [accountAction, setAccountAction] = useState<{
    readonly kind: 'reset-second-factor' | 'sign-out-everywhere';
    readonly profileId: string;
  } | null>(null);

  const presetName = (preset: PermissionPreset) =>
    preset.name ?? t(`team.preset.${preset.builtinKey ?? 'custom'}`);
  const accessOf = (profileId: string): TeamMemberAccess =>
    access.find((entry) => entry.profileId === profileId) ?? {
      profileId,
      presetId: null,
      permissions: new Set(),
    };
  const defaultInvitePreset = presets.find((preset) => preset.builtinKey === 'staff') ?? presets[0];

  async function run(operation: () => Promise<void>, success: string): Promise<boolean> {
    setPending(true);
    setMessage(null);
    try {
      await operation();
      setMessage({ kind: 'success', text: success });
      return true;
    } catch (error) {
      setMessage({ kind: 'error', text: explainFailure(error, t) });
      return false;
    } finally {
      setPending(false);
    }
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void run(async () => {
      await onInvite({
        firstName: String(fields.get('first-name') ?? ''),
        lastName: String(fields.get('last-name') ?? ''),
        email: String(fields.get('email') ?? ''),
        presetId: String(fields.get('preset') ?? defaultInvitePreset?.id ?? ''),
      });
      form.reset();
    }, t('inviteSent'));
  }

  const editingMember = members.find((member) => member.profile_id === editingMemberId);
  const editingPreset =
    editingPresetId === 'new' ? null : presets.find((preset) => preset.id === editingPresetId);
  const applyPreset = presets.find((preset) => preset.id === applyPresetId);

  return (
    <div className="space-y-8" data-testid="team-access">
      <MessageToast message={message} onClose={() => setMessage(null)} />

      <section className="space-y-4">
        <header className="max-w-3xl space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{t('team.title')}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t('team.intro')}</p>
        </header>
        <form
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={submitInvite}
          data-testid="staff-invite-form"
        >
          <Field label={t('firstName')}>
            <Input name="first-name" required />
          </Field>
          <Field label={t('lastName')}>
            <Input name="last-name" required />
          </Field>
          <Field label={t('email')}>
            <Input name="email" type="email" required />
          </Field>
          <Field label={t('team.presetLabel')}>
            <select
              name="preset"
              defaultValue={defaultInvitePreset?.id}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {presetName(preset)}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" className="self-end" disabled={pending}>
            {pending ? t('working') : t('invite')}
          </Button>
        </form>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('email')}</TableHead>
                <TableHead>{t('team.accessColumn')}</TableHead>
                <TableHead>{t('statusActive')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const summary = summarizeAccess(accessOf(member.profile_id), presets);
                return (
                  <TableRow
                    key={member.profile_id}
                    data-testid={`team-member-${member.profile_id}`}
                  >
                    <TableCell>
                      <span className="font-medium">
                        {member.first_name} {member.last_name}
                      </span>
                      <br />
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </TableCell>
                    <TableCell data-testid={`team-access-${member.profile_id}`}>
                      {summary.kind === 'custom'
                        ? t('team.custom')
                        : summary.adjusted
                          ? t('team.adjusted', { preset: presetName(summary.preset) })
                          : presetName(summary.preset)}
                    </TableCell>
                    <TableCell>
                      {member.is_active ? t('statusActive') : t('statusInactive')}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap text-end">
                      {member.is_active ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingMemberId(member.profile_id)}
                            aria-label={t('team.editAccessFor', { name: member.email })}
                          >
                            {t('team.editAccess')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAccountAction({
                                kind: 'sign-out-everywhere',
                                profileId: member.profile_id,
                              })
                            }
                            aria-label={`${t('auth:signOutEverywhereAction')} ${member.email}`}
                          >
                            {t('auth:signOutEverywhereAction')}
                          </Button>
                          {member.profile_id === currentUserId ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setAccountAction({
                                  kind: 'reset-second-factor',
                                  profileId: member.profile_id,
                                })
                              }
                              aria-label={`${t('auth:secondFactorResetAction')} ${member.email}`}
                            >
                              {t('auth:secondFactorResetAction')}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => setRemoveProfileId(member.profile_id)}
                            aria-label={t('team.removeFor', { name: member.email })}
                          >
                            {t('remove')}
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex max-w-3xl flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{t('team.presetsTitle')}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{t('team.presetsIntro')}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditingPresetId('new')}>
            {t('team.newPreset')}
          </Button>
        </header>
        <ul className="grid max-w-3xl gap-3">
          {presets.map((preset) => {
            const users = membersUsingPreset(preset.id, access).length;
            return (
              <li
                key={preset.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
                data-testid={`team-preset-${preset.id}`}
              >
                <div className="space-y-1">
                  <p className="font-medium">
                    {presetName(preset)}{' '}
                    {preset.builtinKey !== null ? (
                      <Badge variant="secondary">{t('team.builtIn')}</Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('team.presetSummary', { count: preset.permissions.size, people: users })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingPresetId(preset.id)}
                    aria-label={t('team.editPresetFor', { name: presetName(preset) })}
                  >
                    {t('team.editPreset')}
                  </Button>
                  {preset.builtinKey !== null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        void run(() => onRestorePreset(preset.id), t('team.presetRestored'))
                      }
                    >
                      {t('team.restoreDefault')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        void run(() => onDeletePreset(preset.id), t('team.presetDeleted'))
                      }
                      aria-label={t('team.deletePresetFor', { name: presetName(preset) })}
                    >
                      {t('team.deletePreset')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {editingMember !== undefined ? (
        <MemberAccessDialog
          error={message?.kind === 'error' ? message.text : null}
          member={editingMember}
          access={accessOf(editingMember.profile_id)}
          presets={presets}
          presetName={presetName}
          myPermissions={myPermissions}
          pending={pending}
          onClose={() => setEditingMemberId(null)}
          onSave={async (permissions, presetId) => {
            const saved = await run(
              () =>
                onSaveMemberAccess({ profileId: editingMember.profile_id, permissions, presetId }),
              t('team.accessSaved'),
            );
            if (saved) setEditingMemberId(null);
          }}
        />
      ) : null}

      {editingPresetId !== null && (editingPresetId === 'new' || editingPreset !== undefined) ? (
        <PresetDialog
          error={message?.kind === 'error' ? message.text : null}
          preset={editingPreset ?? null}
          presetName={presetName}
          myPermissions={myPermissions}
          pending={pending}
          onClose={() => setEditingPresetId(null)}
          onSave={async (name, permissions) => {
            let savedId: string | null = null;
            const saved = await run(async () => {
              savedId = await onSavePreset({
                presetId: editingPreset?.id ?? null,
                name,
                permissions,
              });
            }, t('team.presetSaved'));
            if (!saved) return;
            setEditingPresetId(null);
            // Nobody's access changes on its own: applying the edit is a choice.
            if (savedId !== null && membersUsingPreset(savedId, access).length > 0) {
              setApplyPresetId(savedId);
            }
          }}
        />
      ) : null}

      {applyPreset !== undefined ? (
        <ApplyPresetDialog
          error={message?.kind === 'error' ? message.text : null}
          preset={applyPreset}
          presetName={presetName}
          users={members.filter((member) =>
            membersUsingPreset(applyPreset.id, access).some(
              (entry) => entry.profileId === member.profile_id,
            ),
          )}
          pending={pending}
          onClose={() => setApplyPresetId(null)}
          onApply={async (profileIds) => {
            const applied = await run(
              () => onApplyPreset(applyPreset.id, profileIds),
              t('team.presetApplied', { count: profileIds.length }),
            );
            if (applied) setApplyPresetId(null);
          }}
        />
      ) : null}

      <Dialog
        open={accountAction !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setAccountAction(null);
        }}
      >
        {accountAction !== null ? (
          <DialogContent
            role="alertdialog"
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('account-action-cancel')?.focus();
            }}
          >
            <DialogTitle>
              {accountAction.kind === 'reset-second-factor'
                ? t('auth:secondFactorResetAction')
                : t('auth:signOutEverywhereAction')}
            </DialogTitle>
            <DialogDescription>
              {accountAction.kind === 'reset-second-factor'
                ? t('auth:secondFactorResetConfirm')
                : t('auth:signOutEverywhereConfirm')}
            </DialogDescription>
            <DialogError message={message?.kind === 'error' ? message.text : null} />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(
                    async () => {
                      if (accountAction.kind === 'reset-second-factor') {
                        await onResetSecondFactor(accountAction.profileId);
                      } else {
                        await onSignOutEverywhere(accountAction.profileId);
                      }
                      setAccountAction(null);
                    },
                    accountAction.kind === 'reset-second-factor'
                      ? t('auth:secondFactorResetDone')
                      : t('auth:signOutEverywhereDone'),
                  )
                }
              >
                {t('confirm')}
              </Button>
              <DialogClose asChild>
                <Button id="account-action-cancel" type="button" variant="outline">
                  {t('cancel')}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={removeProfileId !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoveProfileId(null);
        }}
      >
        {removeProfileId !== null ? (
          <DialogContent
            role="alertdialog"
            className="border-destructive/30"
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('remove-staff-cancel')?.focus();
            }}
          >
            <DialogTitle>{t('remove')}</DialogTitle>
            <DialogDescription>{t('removeConfirm')}</DialogDescription>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await onRemove(removeProfileId);
                    setRemoveProfileId(null);
                  }, t('team.removed'))
                }
              >
                {t('confirm')}
              </Button>
              <DialogClose asChild>
                <Button id="remove-staff-cancel" type="button" variant="outline">
                  {t('cancel')}
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** The database refuses with a stable code in the message; each gets plain words. */
function explainFailure(error: unknown, t: (key: string) => string): string {
  return t(teamAccessErrorKey(error));
}

function MemberAccessDialog({
  error,
  member,
  access,
  presets,
  presetName,
  myPermissions,
  pending,
  onClose,
  onSave,
}: {
  readonly error: string | null;
  readonly member: StaffMember;
  readonly access: TeamMemberAccess;
  readonly presets: readonly PermissionPreset[];
  readonly presetName: (preset: PermissionPreset) => string;
  readonly myPermissions: ReadonlySet<PermissionCode>;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSave: (permissions: ReadonlySet<PermissionCode>, presetId: string | null) => void;
}) {
  const { t } = useTranslation('settings');
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionCode>>(access.permissions);
  const [presetId, setPresetId] = useState<string | null>(access.presetId);
  const [chosenPresetId, setChosenPresetId] = useState(access.presetId ?? presets[0]?.id ?? '');
  const chosen = presets.find((preset) => preset.id === chosenPresetId);
  // Applying a preset may only touch toggles the reader holds; the rest stay.
  const reachable = (code: PermissionCode) => myPermissions.has(code);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>
          {t('team.editAccessTitle', { name: `${member.first_name} ${member.last_name}` })}
        </DialogTitle>
        <DialogDescription>{t('team.editAccessIntro')}</DialogDescription>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('team.presetLabel')}>
            <select
              value={chosenPresetId}
              onChange={(event) => setChosenPresetId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {presetName(preset)}
                </option>
              ))}
            </select>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={chosen === undefined}
            onClick={() => {
              if (chosen === undefined) return;
              setPermissions((current) => {
                const next = new Set<PermissionCode>();
                for (const { codes } of permissionsByArea()) {
                  for (const code of codes) {
                    const wanted = reachable(code)
                      ? chosen.permissions.has(code)
                      : current.has(code);
                    if (wanted) next.add(code);
                  }
                }
                return next;
              });
              setPresetId(chosen.id);
            }}
          >
            {t('team.usePreset')}
          </Button>
        </div>
        <PermissionToggles value={permissions} onChange={setPermissions} holds={reachable} />
        <DialogError message={error} />
        <div className="sticky -bottom-6 -mx-6 -mb-6 flex gap-2 border-t bg-card px-6 pt-4 pb-6">
          <Button
            type="button"
            disabled={
              pending ||
              (sameCodes(permissions, access.permissions) && presetId === access.presetId)
            }
            onClick={() => onSave(permissions, presetId)}
          >
            {pending ? t('working') : t('save')}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PresetDialog({
  error,
  preset,
  presetName,
  myPermissions,
  pending,
  onClose,
  onSave,
}: {
  readonly error: string | null;
  readonly preset: PermissionPreset | null;
  readonly presetName: (preset: PermissionPreset) => string;
  readonly myPermissions: ReadonlySet<PermissionCode>;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onSave: (name: string | null, permissions: ReadonlySet<PermissionCode>) => void;
}) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState(preset?.name ?? '');
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionCode>>(
    preset?.permissions ?? new Set(),
  );
  const isBuiltIn = preset?.builtinKey != null;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>
          {preset === null
            ? t('team.newPreset')
            : t('team.editPresetTitle', { name: presetName(preset) })}
        </DialogTitle>
        <DialogDescription>{t('team.editPresetIntro')}</DialogDescription>
        <Field label={t('team.presetName')}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={preset !== null && isBuiltIn ? presetName({ ...preset, name: null }) : ''}
            required={!isBuiltIn}
            maxLength={80}
          />
        </Field>
        <PermissionToggles
          value={permissions}
          onChange={setPermissions}
          holds={(code) => myPermissions.has(code)}
        />
        <DialogError message={error} />
        <div className="sticky -bottom-6 -mx-6 -mb-6 flex gap-2 border-t bg-card px-6 pt-4 pb-6">
          <Button
            type="button"
            disabled={pending || (!isBuiltIn && name.trim() === '')}
            onClick={() => onSave(name.trim() === '' ? null : name.trim(), permissions)}
          >
            {pending ? t('working') : t('save')}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApplyPresetDialog({
  error,
  preset,
  presetName,
  users,
  pending,
  onClose,
  onApply,
}: {
  readonly error: string | null;
  readonly preset: PermissionPreset;
  readonly presetName: (preset: PermissionPreset) => string;
  readonly users: readonly StaffMember[];
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onApply: (profileIds: readonly string[]) => void;
}) {
  const { t } = useTranslation('settings');
  const [scope, setScope] = useState<'everyone' | 'some' | 'nobody'>('everyone');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const name = useId();
  const targets =
    scope === 'everyone'
      ? users.map((user) => user.profile_id)
      : scope === 'some'
        ? [...chosen]
        : [];

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>
          {t('team.applyTitle', { count: users.length, preset: presetName(preset) })}
        </DialogTitle>
        <DialogDescription>{t('team.applyIntro')}</DialogDescription>
        <fieldset className="space-y-2">
          {(['everyone', 'some', 'nobody'] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                checked={scope === option}
                onChange={() => setScope(option)}
              />
              {t(`team.apply.${option}`, { count: users.length })}
            </label>
          ))}
        </fieldset>
        {scope === 'some' ? (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {users.map((user) => (
              <li key={user.profile_id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.has(user.profile_id)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(user.profile_id);
                        else next.delete(user.profile_id);
                        return next;
                      })
                    }
                  />
                  {user.first_name} {user.last_name}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogError message={error} />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => (targets.length === 0 ? onClose() : onApply(targets))}
          >
            {pending ? t('working') : t('confirm')}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Every permission as a checkbox, grouped by area, each area with a select-all. */
function PermissionToggles({
  value,
  onChange,
  holds,
}: {
  readonly value: ReadonlySet<PermissionCode>;
  readonly onChange: (next: ReadonlySet<PermissionCode>) => void;
  readonly holds: (code: PermissionCode) => boolean;
}) {
  const { t } = useTranslation('settings');
  const lockedAny = permissionsByArea().some(({ codes }) => codes.some((code) => !holds(code)));

  function setCodes(codes: readonly PermissionCode[], on: boolean) {
    const next = new Set(value);
    for (const code of codes) {
      if (!holds(code)) continue;
      if (on) next.add(code);
      else next.delete(code);
    }
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {lockedAny ? <p className="rounded-lg bg-muted p-3 text-sm">{t('team.lockedHint')}</p> : null}
      {permissionsByArea().map(({ area, codes }) => (
        <AreaGroup
          key={area}
          area={area}
          codes={codes}
          value={value}
          holds={holds}
          onArea={(on) => setCodes(codes, on)}
        >
          {codes.map((code) => (
            <label key={code} className="flex items-start gap-3 py-1 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={value.has(code)}
                disabled={!holds(code)}
                onChange={(event) => setCodes([code], event.target.checked)}
                data-testid={`permission-${code}`}
              />
              <span>
                <span className="font-medium">{t(`permissions.${permissionKey(code)}.label`)}</span>
                <br />
                <span className="text-muted-foreground">
                  {t(`permissions.${permissionKey(code)}.description`)}
                </span>
              </span>
            </label>
          ))}
        </AreaGroup>
      ))}
    </div>
  );
}

function AreaGroup({
  area,
  codes,
  value,
  holds,
  onArea,
  children,
}: {
  readonly area: PermissionArea;
  readonly codes: readonly PermissionCode[];
  readonly value: ReadonlySet<PermissionCode>;
  readonly holds: (code: PermissionCode) => boolean;
  readonly onArea: (on: boolean) => void;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('settings');
  const checkbox = useRef<HTMLInputElement>(null);
  const on = codes.filter((code) => value.has(code)).length;
  useEffect(() => {
    if (checkbox.current !== null) checkbox.current.indeterminate = on > 0 && on < codes.length;
  }, [on, codes.length]);

  return (
    <fieldset className="rounded-xl border p-3">
      <legend className="px-1">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            ref={checkbox}
            type="checkbox"
            checked={on === codes.length}
            disabled={!codes.some(holds)}
            onChange={(event) => onArea(event.target.checked)}
            data-testid={`permission-area-${area}`}
          />
          {t(`team.area.${area}`)}
        </label>
      </legend>
      {children}
    </fieldset>
  );
}

/** A modal hides the page from screen readers, so its own failures are announced inside it. */
function DialogError({ message }: { readonly message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MessageToast({
  message,
  onClose,
}: {
  readonly message: Message | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 sm:start-auto sm:end-6 sm:w-96">
      {(['success', 'error'] as const).map((kind) => (
        <div key={kind} role={kind === 'success' ? 'status' : 'alert'} aria-atomic="true">
          {message?.kind === kind ? (
            <div className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg">
              {kind === 'success' ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <CircleAlert
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              )}
              <p className="min-w-0 flex-1 break-words text-sm font-medium">{message.text}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1 shrink-0"
                aria-label={t('close')}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
