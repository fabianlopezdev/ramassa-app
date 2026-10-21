import { RouteFocusManager } from '@/components/accessibility/route-focus-manager';
import { RequireAuth } from '@/components/auth/require-auth';
import { StaffSidebar } from '@/components/nav/staff-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { designRoleRedirect } from '@/lib/design-role-access';
import { guardStaffRoute } from '@/lib/staff-route-guard';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Navigate, Outlet, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAuth } from '@ramassa/shared/auth';

export const Route = createFileRoute('/_staff')({
  // The session lives in the browser (localStorage), so the guard below runs
  // there: with ssr false, beforeLoad and every child loader run on the client
  // (https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr).
  ssr: false,
  // The design role's redirect is thrown before any child loader runs, so a
  // forbidden page never asks the database for its data (RAPP-615).
  beforeLoad: ({ location }) => guardStaffRoute(supabase, location.pathname),
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
        <SidebarProvider>
          <RouteFocusManager targetId="main-content" />
          <StaffSidebar />
          {/* SidebarInset renders the page's single `main` landmark, so child
            routes render sections rather than nesting another `main`. */}
          <SidebarInset id="main-content" tabIndex={-1}>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
              <SidebarTrigger />
            </header>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
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
  const { permissions } = useAuth();
  const pathname = useLocation({ select: (location) => location.pathname });
  const target = designRoleRedirect(pathname, permissions);
  if (target !== null) return <Navigate to={target} replace />;
  return <>{children}</>;
}
