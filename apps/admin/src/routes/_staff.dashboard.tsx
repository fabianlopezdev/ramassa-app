import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-lg font-semibold text-neutral-900">Staff dashboard placeholder</h1>
    </main>
  );
}
