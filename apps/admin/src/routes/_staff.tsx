import { RouteFocusManager } from '@/components/accessibility/route-focus-manager';
import { RequireAuth } from '@/components/auth/require-auth';
import { FundingFooter } from '@/components/nav/funding-footer';
import { StaffSidebar } from '@/components/nav/staff-sidebar';
import { TodoBell } from '@/components/nav/todo-bell';
import { UserMenu } from '@/components/nav/user-menu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { logout } from '@/lib/auth';
import { designRoleRedirect } from '@/lib/design-role-access';
import { guardStaffRoute } from '@/lib/staff-route-guard';
import { supabase } from '@/lib/supabase';
import { TodoCountsProvider } from '@/lib/todo-counts';
import { createFileRoute, Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { assuranceLevelOf, useAuth } from '@ramassa/shared/auth';

export const Route = createFileRoute('/_staff')({
  // The session lives in the browser (localStorage), so the guard below runs
  // there: with ssr false, beforeLoad and every child loader run on the client
  // (https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr).
  ssr: false,
  // The second-factor step and the design role's redirect are thrown before
  // any child loader runs, so a page never asks the database for data it
  // would refuse (RAPP-615).
  beforeLoad: ({ location, context }) => guardStaffRoute(supabase, context.staffAccess, location),
  component: StaffLayout,
});

// Staff and admins only (RAPP-13): an entity user is redirected to their portal
// and a player gets a terminal no-access screen. Guarding the LAYOUT means every
// staff route is deny-by-default; a new child route cannot forget its guard.
const STAFF_ROLES = ['staff', 'admin'] as const;

function StaffLayout() {
  return (
    <RequireAuth allow={STAFF_ROLES}>
      <DesignRoleGate>
        {/* The bell and the sidebar's Messages badge share one source (RAPP-635). */}
        <TodoCountsProvider>
          <SidebarProvider>
            <RouteFocusManager targetId="main-content" />
            <StaffSidebar />
            {/* SidebarInset renders the page's single `main` landmark, so child
            routes render sections rather than nesting another `main`. */}
            <SidebarInset id="main-content" tabIndex={-1} className="bg-canvas">
              {/* The top bar (RAPP-632): the sidebar toggle at the start, the
              to-do bell (RAPP-635) and her user menu at the end. The language
              moved to her account page (RAPP-634). */}
              <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 shadow-xs backdrop-blur">
                <SidebarTrigger />
                <div className="ms-auto flex items-center gap-2" data-testid="top-bar-actions">
                  <TodoBell />
                  <UserMenu onSignOut={logout} accountPage="/account" />
                </div>
              </header>
              <Outlet />
              <FundingFooter />
            </SidebarInset>
          </SidebarProvider>
        </TodoCountsProvider>
      </DesignRoleGate>
    </RequireAuth>
  );
}

/**
 * The onboarding design role (RAPP-615) reaches the onboarding page and the
 * test players only. `beforeLoad` above redirects before any loader runs; this
 * component gate also follows a permission change during the session (the
 * permissions reload live), without a navigation. The database refuses her
 * the data on its own.
 */
function DesignRoleGate({ children }: { readonly children: ReactNode }) {
  const { session, role, permissions, permissionsAreCurrent, secondFactorWaived } = useAuth();
  const { staffAccess } = Route.useRouteContext();
  // The guard's cache follows the auth state, which re-reads the permissions
  // the moment someone changes them (RAPP-237): the next navigation then
  // routes on the new set without asking the database again.
  const userId = session?.user.id ?? null;
  // A staging test account whose second factor is waived (RAPP-628) reads her
  // permissions at aal1, so they are as complete as a verified session's.
  const isVerifiedTeam =
    (role === 'staff' || role === 'admin') &&
    permissionsAreCurrent &&
    (assuranceLevelOf(session) === 'aal2' || secondFactorWaived);
  useEffect(() => {
    if (userId !== null && isVerifiedTeam) staffAccess.rememberPermissions(userId, permissions);
  }, [staffAccess, userId, isVerifiedTeam, permissions]);
  const pathname = useLocation({ select: (location) => location.pathname });
  const target = designRoleRedirect(pathname, permissions);
  if (target !== null) return <Navigate to={target} replace />;
  return <>{children}</>;
}
