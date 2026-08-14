import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity/portal/referrals')({
  component: Outlet,
});
