/**
 * The user button at the right of the top bar (RAPP-632): her photo, or her
 * initials when she has none. It opens a menu with her name and email, her
 * profile photo (RAPP-633) and Sign out, for every team member, the design
 * role included (RAPP-615), and for entity contacts. Signing out clears the
 * session; the guard then sends her to /login.
 */
import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { TOP_BAR_TRIGGER_TONE, type TopBarTone } from '@/components/nav/language-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { mediaWorkerUrl } from '@/lib/media-worker';
import {
  accountDisplayName,
  accountInitials,
  useOwnAccount,
  type OwnAccount,
} from '@/lib/own-account';
import { cn } from '@/lib/utils';
import { ChevronDown, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

export interface UserMenuProps {
  /** The layout passes the app's `logout`, so this file stays free of the client. */
  readonly onSignOut: () => Promise<unknown>;
  readonly tone?: TopBarTone;
}

export function AccountAvatar({
  account,
  className,
}: {
  readonly account: OwnAccount;
  readonly className?: string;
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
      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
        {accountInitials(account)}
      </AvatarFallback>
    </Avatar>
  );
}

export function UserMenu({ onSignOut, tone = 'light' }: UserMenuProps) {
  const { t } = useTranslation(['admin', 'auth']);
  const { account } = useOwnAccount();
  if (account === null) return null;
  const name = accountDisplayName(account);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          data-testid="user-menu-trigger"
          aria-label={t('admin:userMenu.label', { name })}
          className={cn('h-10 gap-2 rounded-full ps-1 pe-2', TOP_BAR_TRIGGER_TONE[tone])}
        >
          <AccountAvatar
            account={account}
            className={tone === 'brand' ? 'ring-2 ring-white/30' : 'ring-2 ring-primary/15'}
          />
          <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{name}</span>
          <ChevronDown aria-hidden="true" className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-2 py-2 text-start">
            <AccountAvatar account={account} className="size-10" />
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{account.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem data-testid="staff-sign-out" onSelect={() => void onSignOut()}>
            <LogOut aria-hidden="true" />
            {t('auth:signOutAction')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
