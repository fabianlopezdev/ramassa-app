import { RouteFocusManager } from '@/components/accessibility/route-focus-manager';
import { RequireAuth } from '@/components/auth/require-auth';
import { StaffSidebar } from '@/components/nav/staff-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { designRoleRedirect } from '@/lib/design-role-access';
import { createFileRoute, Navigate, Outlet, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAuth } from '@ramassa/shared/auth';

export const Route = createFileRoute('/_staff')({
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
 * test players only: every other staff URL, typed or followed, sends her back.
 * Guarding here, at the layout, keeps it deny-by-default for routes added
 * later. A UX gate like `RequireAuth`; the database refuses her the data.
 */
function DesignRoleGate({ children }: { readonly children: ReactNode }) {
  const { permissions } = useAuth();
  const pathname = useLocation({ select: (location) => location.pathname });
  const target = designRoleRedirect(pathname, permissions);
  if (target !== null) return <Navigate to={target} replace />;
  return <>{children}</>;
}
