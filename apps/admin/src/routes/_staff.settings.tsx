import { AdminPlaceholder } from '@/components/nav/admin-placeholder';
import { createFileRoute } from '@tanstack/react-router';

// Placeholder section for the staff settings area (RAPP-16); the feature lands later.
export const Route = createFileRoute('/_staff/settings')({
  component: () => <AdminPlaceholder titleKey="nav:staff.settings" />,
});
