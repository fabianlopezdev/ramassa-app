import { cn } from '@/lib/utils';
import * as React from 'react';

export const INPUT_FRAME_CLASS_NAME =
  'rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 px-3 py-1 text-base selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        INPUT_FRAME_CLASS_NAME,
        'placeholder:text-muted-foreground',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        'md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
