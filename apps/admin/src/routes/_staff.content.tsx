import { createFileRoute, Outlet } from '@tanstack/react-router';

// Placeholder section for the staff content area (RAPP-16); the feature lands later.
export const Route = createFileRoute('/_staff/content')({
  component: Outlet,
});
