import { AdminPlaceholder } from '@/components/nav/admin-placeholder';
import { createFileRoute } from '@tanstack/react-router';

// Placeholder section for the entity services area (RAPP-16); the feature lands later.
export const Route = createFileRoute('/_entity/portal/services')({
  component: () => <AdminPlaceholder titleKey="nav:entity.services" />,
});
