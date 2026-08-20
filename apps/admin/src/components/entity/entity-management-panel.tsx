import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreateEntityInput,
  EntityCollaborator,
  InviteEntityCollaboratorInput,
  ManagedEntity,
} from '@ramassa/shared/entity-management';

interface EntityManagementPanelProps {
  readonly entities: readonly ManagedEntity[];
  readonly collaborators: readonly EntityCollaborator[];
  readonly selectedEntityId: string | null;
  readonly onSelectEntity: (entityId: string) => void;
  readonly onCreateEntity: (input: CreateEntityInput) => Promise<void>;
  readonly onInvite: (input: InviteEntityCollaboratorInput) => Promise<void>;
  readonly onSetEntityActive: (entityId: string, isActive: boolean) => Promise<void>;
  readonly onSetCollaboratorActive: (profileId: string, isActive: boolean) => Promise<void>;
}

type Action = 'create' | 'invite' | 'entity' | 'collaborator';
type Confirmation =
  | { readonly kind: 'entity'; readonly entityId: string }
  | { readonly kind: 'collaborator'; readonly profileId: string };

export function EntityManagementPanel({
  entities,
  collaborators,
  selectedEntityId,
  onSelectEntity,
  onCreateEntity,
  onInvite,
  onSetEntityActive,
  onSetCollaboratorActive,
}: EntityManagementPanelProps) {
  const { t } = useTranslation('entity-management');
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;

  async function run(action: Action, operation: Promise<void>, success?: string) {
    setPending(action);
    setMessage(null);
    try {
      await operation;
      setMessage(success ?? null);
    } catch {
      setMessage(t('actionError'));
    } finally {
      setPending(null);
    }
  }

  function submitEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('entity-name') ?? '').trim();
    if (name.length === 0) return;
    void run(
      'create',
      onCreateEntity({ name }).then(() => {
        form.reset();
      }),
      t('entityCreated'),
    );
  }

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void run(
      'invite',
      onInvite({
        email: String(fields.get('email') ?? ''),
        firstName: String(fields.get('first-name') ?? ''),
        lastName: String(fields.get('last-name') ?? ''),
      }).then(() => form.reset()),
      t('inviteSent'),
    );
  }

  return (
    <section className="space-y-8 p-4 sm:p-6">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('managementTitle')}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t('managementIntro')}</p>
      </header>

      {message ? (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      ) : null}

      <form
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto]"
        data-testid="entity-create-form"
        onSubmit={submitEntity}
      >
        <label className="space-y-1 text-sm font-medium">
          <span>{t('entityName')}</span>
          <Input name="entity-name" maxLength={200} required />
        </label>
        <Button className="self-end" disabled={pending === 'create'} type="submit">
          {pending === 'create' ? t('working') : t('addEntity')}
        </Button>
      </form>

      <section className="space-y-4" aria-labelledby="entity-selection-heading">
        <h2 id="entity-selection-heading" className="text-lg font-semibold text-foreground">
          {t('selectEntity')}
        </h2>
        <label className="block max-w-xl space-y-1 text-sm font-medium">
          <span>{t('selectEntity')}</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedEntityId ?? ''}
            onChange={(event) => onSelectEntity(event.target.value)}
          >
            <option value="" disabled>
              {t('selectEntity')}
            </option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>

        {selectedEntity ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">{t('collaborators')}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {selectedEntity.activeCollaboratorCount}
                </p>
              </div>
              <div className="rounded-xl border p-4" data-testid="managed-entity-referrals">
                <p className="text-sm text-muted-foreground">{t('referrals')}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {selectedEntity.referralCount}
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">{t('pendingInvitations')}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {selectedEntity.pendingInvitationCount}
                </p>
              </div>
            </div>

            {confirmation?.kind === 'entity' && confirmation.entityId === selectedEntity.id ? (
              <div
                className="max-w-2xl space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
                role="group"
                aria-label={t('confirmDeactivateEntity')}
              >
                <p className="text-sm leading-6 text-foreground">
                  {t('confirmEntityDeactivation')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={pending === 'entity'}
                    onClick={() => {
                      setConfirmation(null);
                      void run(
                        'entity',
                        onSetEntityActive(selectedEntity.id, false),
                        t('entityDeactivated'),
                      );
                    }}
                    type="button"
                  >
                    {t('confirmDeactivateEntity')}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmation(null)} type="button">
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant={selectedEntity.isActive ? 'destructive' : 'outline'}
                disabled={pending === 'entity'}
                onClick={() => {
                  if (selectedEntity.isActive) {
                    setConfirmation({ kind: 'entity', entityId: selectedEntity.id });
                    return;
                  }
                  void run(
                    'entity',
                    onSetEntityActive(selectedEntity.id, true),
                    t('entityReactivated'),
                  );
                }}
                type="button"
              >
                {selectedEntity.isActive ? t('deactivateEntity') : t('reactivateEntity')}
              </Button>
            )}

            <section className="space-y-3" aria-labelledby="entity-collaborators-heading">
              <h3 id="entity-collaborators-heading" className="font-semibold text-foreground">
                {t('collaborators')}
              </h3>
              {collaborators.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noCollaborators')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('firstName')}</TableHead>
                      <TableHead>{t('email')}</TableHead>
                      <TableHead>{t('statusHeading')}</TableHead>
                      <TableHead>
                        <span className="sr-only">{t('removeAccess')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collaborators.map((collaborator) => (
                      <TableRow key={collaborator.profileId}>
                        <TableCell className="font-medium">
                          {collaborator.firstName} {collaborator.lastName}
                        </TableCell>
                        <TableCell>{collaborator.email}</TableCell>
                        <TableCell>
                          {collaborator.isActive ? t('status.active') : t('status.inactive')}
                        </TableCell>
                        <TableCell className="text-end">
                          {confirmation?.kind === 'collaborator' &&
                          confirmation.profileId === collaborator.profileId ? (
                            <div
                              className="ms-auto max-w-sm space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-start"
                              role="group"
                              aria-label={t('confirmRemoveAccess')}
                            >
                              <p className="text-sm leading-5 text-foreground">
                                {t('confirmCollaboratorRemoval')}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={pending === 'collaborator'}
                                  onClick={() => {
                                    setConfirmation(null);
                                    void run(
                                      'collaborator',
                                      onSetCollaboratorActive(collaborator.profileId, false),
                                      t('collaboratorAccessRemoved'),
                                    );
                                  }}
                                  type="button"
                                >
                                  {t('confirmRemoveAccess')}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmation(null)}
                                  type="button"
                                >
                                  {t('cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending === 'collaborator'}
                              onClick={() => {
                                if (collaborator.isActive) {
                                  setConfirmation({
                                    kind: 'collaborator',
                                    profileId: collaborator.profileId,
                                  });
                                  return;
                                }
                                void run(
                                  'collaborator',
                                  onSetCollaboratorActive(collaborator.profileId, true),
                                  t('collaboratorAccessRestored'),
                                );
                              }}
                              type="button"
                            >
                              {collaborator.isActive ? t('removeAccess') : t('restoreAccess')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <form
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
              data-testid="entity-invite-form"
              onSubmit={submitInvitation}
            >
              <h3 className="font-semibold text-foreground sm:col-span-2">{t('inviteTitle')}</h3>
              <label className="space-y-1 text-sm font-medium sm:col-span-2">
                <span>{t('firstName')}</span>
                <Input name="first-name" required />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>{t('lastName')}</span>
                <Input name="last-name" required />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>{t('email')}</span>
                <Input name="email" type="email" required />
              </label>
              <Button
                className="sm:col-span-2 sm:justify-self-start"
                disabled={pending === 'invite'}
                type="submit"
              >
                {pending === 'invite' ? t('working') : t('sendInvite')}
              </Button>
            </form>
          </div>
        ) : null}
      </section>
    </section>
  );
}
