import { AdminPlaceholder } from '@/components/nav/admin-placeholder';
import { createFileRoute } from '@tanstack/react-router';

// Placeholder section for the entity messages area (RAPP-16); the feature lands later.
export const Route = createFileRoute('/_entity/portal/messages')({
  component: () => <AdminPlaceholder titleKey="nav:entity.messages" />,
});
