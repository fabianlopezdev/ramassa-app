import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { accountInitials } from '@/lib/initials';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { CalendarDays, Pencil, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { hasJoined, type ParticipantRecord } from '@ramassa/shared/participants';

export function ParticipantProfileHeader({
  participant,
  onEdit,
  actions,
}: {
  readonly participant: ParticipantRecord;
  readonly onEdit?: () => void;
  readonly actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation('participants');
  const { session } = useAuth();
  const photoUrl = useAuthenticatedMediaUrl(
    participant.avatar_url,
    mediaWorkerUrl,
    session?.access_token,
  );
  const joined = hasJoined(participant);
  const name = `${participant.first_name} ${participant.last_name}`.trim();

  return (
    <header
      className="flex flex-col gap-6 rounded-t-xl bg-primary px-6 py-8 text-primary-foreground sm:flex-row sm:items-center sm:gap-8 sm:px-8 lg:gap-10"
      data-testid="participant-profile-header"
    >
      <Avatar className="size-28 rounded-xl after:rounded-xl after:border-primary-foreground/15 sm:h-52 sm:w-48 lg:h-60 lg:w-56">
        {photoUrl === null ? null : (
          <AvatarImage src={photoUrl} alt="" className="rounded-xl object-cover" />
        )}
        <AvatarFallback className="rounded-xl bg-primary-foreground/10 text-4xl font-semibold text-primary-foreground sm:text-6xl">
          {accountInitials({
            firstName: participant.first_name,
            lastName: participant.last_name,
            email: '',
          })}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-start text-3xl font-semibold break-words text-primary-foreground sm:text-4xl lg:text-5xl">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-auto gap-2 px-3 py-1.5 text-sm">
                <UserRound aria-hidden />
                {joined
                  ? participant.is_active
                    ? t('rowActive')
                    : t('rowInactive')
                  : t('rowInvited')}
              </Badge>
              {participant.is_forum_banned ? (
                <Badge className="border-primary-foreground/30 bg-transparent text-primary-foreground">
                  {t('forumBanned')}
                </Badge>
              ) : null}
              {participant.is_test_account ? (
                <Badge className="border-primary-foreground/30 bg-transparent text-primary-foreground">
                  {t('testBadge')}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onEdit === undefined ? null : (
              <Button
                variant="outline"
                onClick={onEdit}
                className="h-10 border-primary-foreground/40 bg-transparent px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Pencil aria-hidden />
                {t('profileDesign.edit')}
              </Button>
            )}
            {actions}
          </div>
        </div>

        <p className="flex items-center gap-2 text-start text-sm text-primary-foreground/85">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          {t(joined ? 'detailJoinedOn' : 'profileDesign.invitedOn', {
            date: new Date(participant.created_at).toLocaleDateString(
              i18n.resolvedLanguage ?? 'ca',
            ),
          })}
        </p>
      </div>
    </header>
  );
}
