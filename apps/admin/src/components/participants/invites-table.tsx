/**
 * The invitations the organization has sent (RAPP-25).
 *
 * A read-only list, deliberately: an invite is created from the new-participant
 * fork and spent by her onboarding, and nothing here edits or deletes one. The
 * screen answers the two questions staff actually ask — "did we already invite
 * her?" and "why has she not appeared yet?" — which is why the status column
 * says expired out loud instead of leaving a date to be mentally compared.
 *
 * A plain table rather than the shared DataTable: no sorting, no paging, no
 * URL state. The roster earns that machinery; a list this size wearing it
 * would be all harness and no horse.
 */

import { Badge } from '@/components/ui/badge';
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
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  inviterName,
  inviteStatus,
  type InviteRow,
  type InviteStatus,
} from '@ramassa/shared/accounts';

const STATUS_BADGE_VARIANT: Record<InviteStatus, 'secondary' | 'default' | 'outline'> = {
  pending: 'secondary',
  accepted: 'default',
  expired: 'outline',
};

export interface InvitesTableProps {
  readonly invites: readonly InviteRow[];
}

export function InvitesTable({ invites }: InvitesTableProps) {
  const { t, i18n } = useTranslation(['participants', 'common']);
  const locale = i18n.resolvedLanguage ?? 'ca';
  const none = t('rowNone');
  // One clock for the whole render: a list judged row by row against a moving
  // now() could show an invite flipping state mid-scroll.
  const now = new Date();

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/participants"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {t('detailBackToList')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-start text-2xl font-semibold">{t('invitesTitle')}</h1>
            <p className="text-start text-sm text-muted-foreground">
              {t('invitesSummary', { count: invites.length })}
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/participants/new">{t('newAction')}</Link>
          </Button>
        </div>
      </header>

      {invites.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-8">
          <p className="font-medium">{t('invitesEmpty')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t('inviteColumnEmail')}</TableHead>
              <TableHead className="text-start">{t('columnEntity')}</TableHead>
              <TableHead className="text-start">{t('inviteColumnInvitedBy')}</TableHead>
              <TableHead className="text-start">{t('inviteColumnCreated')}</TableHead>
              <TableHead className="text-start">{t('inviteColumnExpires')}</TableHead>
              <TableHead className="text-start">{t('inviteColumnStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => {
              const status = inviteStatus(invite, now);
              return (
                <TableRow key={invite.id}>
                  <TableCell className="font-medium">{invite.email}</TableCell>
                  <TableCell>{invite.reference_entity ?? none}</TableCell>
                  <TableCell>{inviterName(invite) ?? t('noteAuthorUnknown')}</TableCell>
                  <TableCell>{new Date(invite.created_at).toLocaleDateString(locale)}</TableCell>
                  <TableCell>{new Date(invite.expires_at).toLocaleDateString(locale)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[status]}>
                      {t(`inviteStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
