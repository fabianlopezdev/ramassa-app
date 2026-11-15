/**
 * Her avatar (RAPP-632, RAPP-633): the profile photo through the
 * authenticated media worker, or her initials on the brand colour when she has
 * none or it is still loading.
 */
import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { accountInitials, type OwnAccount } from '@/lib/own-account';
import { cn } from '@/lib/utils';
import { useAuth } from '@ramassa/shared/auth';

export function AccountAvatar({
  account,
  className,
  fallbackClassName,
}: {
  readonly account: OwnAccount;
  readonly className?: string;
  readonly fallbackClassName?: string;
}) {
  const { session } = useAuth();
  const photoUrl = useAuthenticatedMediaUrl(
    account.avatarUrl,
    mediaWorkerUrl,
    session?.access_token,
  );
  return (
    <Avatar className={className} data-testid="user-avatar">
      {photoUrl === null ? null : (
        <AvatarImage src={photoUrl} alt="" data-testid="user-avatar-photo" />
      )}
      {/* Initials on the brand colour: white on the primary passes AA. */}
      <AvatarFallback
        className={cn(
          'bg-primary text-xs font-semibold text-primary-foreground',
          fallbackClassName,
        )}
      >
        {accountInitials(account)}
      </AvatarFallback>
    </Avatar>
  );
}
