import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity/portal')({
  component: PortalPage,
});

function PortalPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-lg font-semibold text-neutral-900">Entity portal placeholder</h1>
    </main>
  );
}
