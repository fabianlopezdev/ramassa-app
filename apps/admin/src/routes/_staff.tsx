import { RequireAuth } from '@/components/auth/require-auth';
import { StaffSidebar } from '@/components/nav/staff-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { createFileRoute, Outlet } from '@tanstack/react-router';

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
      <SidebarProvider>
        <StaffSidebar />
        {/* SidebarInset renders the page's single `main` landmark, so child
            routes render sections rather than nesting another `main`. */}
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}
