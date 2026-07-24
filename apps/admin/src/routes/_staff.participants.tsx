import { AdminPlaceholder } from '@/components/nav/admin-placeholder';
import { createFileRoute } from '@tanstack/react-router';

// Placeholder section for the staff participants area (RAPP-16); the feature lands later.
export const Route = createFileRoute('/_staff/participants')({
  component: () => <AdminPlaceholder titleKey="nav:staff.participants" />,
});
