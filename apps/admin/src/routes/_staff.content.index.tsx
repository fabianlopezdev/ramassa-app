import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/content/')({
  beforeLoad: () => {
    throw redirect({ to: '/content/announcements' });
  },
});
