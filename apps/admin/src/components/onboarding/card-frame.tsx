import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface CardFrameProps {
  readonly className?: string;
  readonly children: ReactNode;
}

/** Shared dimensions and spacing for board cards and the editor's screen family. */
export function CardFrame({ className, children }: CardFrameProps) {
  return (
    <article
      className={cn('relative flex w-full flex-col gap-3 rounded-2xl border p-3', className)}
    >
      {children}
    </article>
  );
}

export function ScreenCardFrame({ className, children }: CardFrameProps) {
  return (
    <CardFrame className={cn('bg-card transition-shadow hover:shadow-md', className)}>
      {children}
    </CardFrame>
  );
}
