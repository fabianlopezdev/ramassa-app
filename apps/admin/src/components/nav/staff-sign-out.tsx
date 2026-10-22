import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface StaffSignOutProps {
  /** The sidebar passes the app's `logout`. */
  readonly onSignOut: () => Promise<unknown>;
}

/**
 * Sign-out for every team member, in the sidebar (RAPP-615). It used to live
 * on the dashboard only, which the onboarding design role never reaches. It
 * stays in the icon rail when the sidebar is collapsed. Signing out clears
 * the session; the guard then sends her to /login.
 */
export function StaffSignOut({ onSignOut }: StaffSignOutProps) {
  const { t } = useTranslation('auth');
  const label = t('signOutAction');
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={label}
          data-testid="staff-sign-out"
          onClick={() => void onSignOut()}
        >
          <LogOut aria-hidden="true" />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
