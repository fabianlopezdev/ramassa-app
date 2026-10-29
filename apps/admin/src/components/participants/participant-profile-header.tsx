import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { PlayerProfileBanner } from '@/components/participants/player-profile-banner';
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
      className="relative isolate grid overflow-hidden rounded-xl bg-primary text-primary-foreground sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      data-testid="participant-profile-header"
    >
      <PlayerProfileBanner key={participant.id} profileId={participant.id} name={name} />
      <Avatar className="mx-auto mt-6 h-24 w-36 items-center justify-center rounded-none after:hidden sm:mx-0 sm:mt-0 sm:h-72 sm:w-full">
        {photoUrl === null ? null : (
          <AvatarImage
            src={photoUrl}
            alt=""
            className="rounded-none object-cover object-[center_30%] sm:[mask-image:linear-gradient(to_right,black_75%,transparent)] rtl:sm:[mask-image:linear-gradient(to_left,black_75%,transparent)]"
          />
        )}
        <AvatarFallback className="size-24 rounded-full border border-primary-foreground/25 bg-primary/95 text-4xl font-semibold tracking-tight text-secondary shadow-lg sm:size-44 sm:text-7xl">
          {accountInitials({
            firstName: participant.first_name,
            lastName: participant.last_name,
            email: '',
          })}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-col justify-center gap-6 px-6 pt-7 pb-16 sm:py-7 sm:ps-0 sm:pe-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-start text-3xl font-semibold tracking-tight break-words text-primary-foreground xl:text-4xl">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-auto gap-2 px-3 py-1 text-sm">
                <UserRound aria-hidden />
                {joined
                  ? participant.is_active
                    ? t('rowActive')
                    : t('rowInactive')
                  : t('profileDesign.invited')}
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
