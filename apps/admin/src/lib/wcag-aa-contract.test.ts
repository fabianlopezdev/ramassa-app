import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const adminRoot = fileURLToPath(new URL('../', import.meta.url));
const readAdminSource = (path: string) => readFile(`${adminRoot}${path}`, 'utf8');

describe('WCAG AA source contract', () => {
  test('interactive primitives animate only named properties', async () => {
    const paths = [
      'components/ui/badge.tsx',
      'components/ui/button.tsx',
      'components/ui/sidebar.tsx',
      'components/ui/tabs.tsx',
    ] as const;

    for (const path of paths) {
      expect(await readAdminSource(path), path).not.toContain('transition-all');
    }
  });

  test('modal surfaces use the focus-managed dialog primitive', async () => {
    const paths = [
      'components/participants/destructive-confirm.tsx',
      'components/settings/organization-settings-panel.tsx',
    ] as const;

    for (const path of paths) {
      const source = await readAdminSource(path);
      expect(source, path).toContain('@/components/ui/dialog');
      expect(source, path).not.toContain('aria-modal=');
    }
  });

  test('client-side route changes move focus into the destination landmark', async () => {
    const manager = await readAdminSource('components/accessibility/route-focus-manager.tsx');
    const staffLayout = await readAdminSource('routes/_staff.tsx');
    const entityLayout = await readAdminSource('routes/_entity.tsx');

    expect(manager).toContain('export function RouteFocusManager');
    expect(manager).toContain('document.getElementById(targetId)?.focus()');
    expect(staffLayout).toContain('<RouteFocusManager targetId="main-content" />');
    expect(entityLayout).toContain('<RouteFocusManager targetId="main-content" />');
  });
});
