/**
 * The queue of erasure requests participants raised from their own profile
 * (RAPP-22), as the team works it (RAPP-26 scope item 5).
 *
 * It deliberately carries NO action of its own. Asking is not doing: the act
 * itself lives on the participant's own record, behind her name, the summary of
 * what will be destroyed, and a typed confirmation. A "delete" button on a list
 * row is how the wrong row gets deleted, and this is the one screen in the
 * product where that mistake cannot be undone.
 *
 * Her REASON is shown here rather than hidden behind a click, because it is what
 * decides whether the request is even about erasure: "take me off the photos" is
 * a media-consent change, and the difference matters before anyone opens her
 * record with erasure in mind.
 */

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DeletionRequestRow } from '@ramassa/shared/rgpd';

export interface DeletionRequestsTableProps {
  readonly requests: readonly DeletionRequestRow[];
}

export function DeletionRequestsTable({ requests }: DeletionRequestsTableProps) {
  const { t, i18n } = useTranslation('participants');
  const locale = i18n.resolvedLanguage ?? 'ca';

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-start text-2xl font-semibold">{t('deletionRequestsTitle')}</h1>
        <p className="text-start text-sm text-muted-foreground">{t('deletionRequestsHint')}</p>
      </header>

      {requests.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('deletionRequestsEmpty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('deletionRequestColumnParticipant')}</TableHead>
              <TableHead>{t('deletionRequestColumnReason')}</TableHead>
              <TableHead>{t('deletionRequestColumnCreated')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-mono text-xs">{request.profile_id}</TableCell>
                <TableCell>
                  {request.reason === null || request.reason.trim().length === 0 ? (
                    <span className="text-muted-foreground">{t('deletionRequestNoReason')}</span>
                  ) : (
                    request.reason
                  )}
                </TableCell>
                <TableCell>{new Date(request.created_at).toLocaleDateString(locale)}</TableCell>
                <TableCell>
                  <Button asChild size="lg" variant="outline">
                    <Link
                      to="/participants/$participantId"
                      params={{ participantId: request.profile_id }}
                    >
                      {t('deletionRequestOpen')}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
