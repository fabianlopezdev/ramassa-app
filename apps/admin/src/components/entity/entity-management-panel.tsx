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

            <Button
              variant={selectedEntity.isActive ? 'destructive' : 'outline'}
              disabled={pending === 'entity'}
              onClick={() =>
                void run('entity', onSetEntityActive(selectedEntity.id, !selectedEntity.isActive))
              }
              type="button"
            >
              {selectedEntity.isActive ? t('deactivateEntity') : t('reactivateEntity')}
            </Button>

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
                      <TableHead>{t('status.active')}</TableHead>
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
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending === 'collaborator'}
                            onClick={() =>
                              void run(
                                'collaborator',
                                onSetCollaboratorActive(
                                  collaborator.profileId,
                                  !collaborator.isActive,
                                ),
                              )
                            }
                            type="button"
                          >
                            {collaborator.isActive ? t('removeAccess') : t('restoreAccess')}
                          </Button>
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
