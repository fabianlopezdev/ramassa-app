/**
 * The shadcn Toaster on sonner, with the admin's popover colours. The shadcn
 * version reads the theme from next-themes; the Control Center has one light
 * theme, so this one passes it directly.
 */
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
