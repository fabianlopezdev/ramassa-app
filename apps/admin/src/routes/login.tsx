import { Button } from '@/components/ui/button';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-lg font-semibold text-neutral-900">Ramassà admin login placeholder</h1>
      <Button>Entra</Button>
    </main>
  );
}
