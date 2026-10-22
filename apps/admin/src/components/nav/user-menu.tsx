/**
 * The user button at the right of the top bar (RAPP-632): her photo, or her
 * initials when she has none. It opens a menu with her name and email, her
 * profile photo (RAPP-633, in its own dialog) and Sign out, for every team member, the design
 * role included (RAPP-615), and for entity contacts. Signing out clears the
 * session; the guard then sends her to /login.
 */
import { AccountAvatar } from '@/components/nav/account-avatar';
import { TOP_BAR_TRIGGER_TONE, type TopBarTone } from '@/components/nav/language-menu';
import { ProfilePhotoDialog } from '@/components/nav/profile-photo-dialog';
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
import { accountDisplayName, useOwnAccount } from '@/lib/own-account';
import { cn } from '@/lib/utils';
import { Camera, ChevronDown, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface UserMenuProps {
  /** The layout passes the app's `logout`. */
  readonly onSignOut: () => Promise<unknown>;
  readonly tone?: TopBarTone;
}

export function UserMenu({ onSignOut, tone = 'light' }: UserMenuProps) {
  const { t } = useTranslation(['admin', 'auth']);
  const { account, reload } = useOwnAccount();
  const [photoOpen, setPhotoOpen] = useState(false);
  if (account === null) return null;
  const name = accountDisplayName(account);

  return (
    <>
      {/* Not modal, so the photo dialog it opens takes focus cleanly (the
      shadcn dropdown-menu-dialog pattern). */}
      <DropdownMenu modal={false}>
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
            <DropdownMenuItem
              data-testid="user-menu-profile-photo"
              onSelect={() => setPhotoOpen(true)}
            >
              <Camera aria-hidden="true" />
              {t('admin:userMenu.profilePhoto')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem data-testid="staff-sign-out" onSelect={() => void onSignOut()}>
              <LogOut aria-hidden="true" />
              {t('auth:signOutAction')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfilePhotoDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        account={account}
        onChanged={reload}
      />
    </>
  );
}
