import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/messages')({
  component: () => <Outlet />,
});
