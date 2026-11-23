import { describe, expect, test } from 'bun:test';

/**
 * Her notifications switch in the profile (RAPP-956). The decisions are tested
 * in `push-settings.test.ts`; this holds the wiring a refactor could quietly
 * break: the row, the route, the one switch, the way to the phone's settings,
 * the copy in every language and the function that saves it.
 */
const src = `${import.meta.dir}/..`;
const repo = `${import.meta.dir}/../../../..`;
const read = (path: string) => Bun.file(path).text();
const LANGUAGES = ['ca', 'es', 'en', 'fr', 'ar', 'fa'] as const;

describe('the Notificacions screen in her profile', () => {
  test('the profile menu opens it, and hides it on the web', async () => {
    const menu = await read(`${src}/app/(app)/profile.tsx`);
    expect(menu).toContain('testID="profile-open-notifications"');
    expect(menu).toContain("push('/profile-notifications' as Href)");
    expect(menu).toContain('icon={playerNavIcons.notifications}');
    const row = menu.indexOf('testID="profile-open-notifications"');
    expect(menu.lastIndexOf("Platform.OS === 'web' ? null", row)).toBeGreaterThan(-1);
    const icons = await read(`${src}/lib/player-nav-icons.ts`);
    expect(icons).toContain("notifications: 'bell'");
  });

  test('the route is pushed over the tabs like its sibling profile screens', async () => {
    const layout = await read(`${src}/app/(app)/_layout.tsx`);
    expect(layout).toContain('<Stack.Screen name="profile-notifications" />');
  });

  test('the screen is one switch, and the phone settings when the phone blocks them', async () => {
    const screen = await read(`${src}/app/(app)/profile-notifications.tsx`);
    expect(screen.match(/<SwitchCard\b/g)).toHaveLength(1);
    expect(screen).toContain('<ProfileScreenFrame');
    expect(screen).toContain('Linking.openSettings()');
    expect(screen).toContain('action={openSettingsAction}');
    expect(screen).toContain('usePushSettings()');
  });

  test('the hook reads the phone again when the app comes back to the front', async () => {
    const hook = await read(`${src}/lib/use-push-settings.ts`);
    expect(hook).toContain('addForegroundListener(readPermission)');
    expect(hook).toContain('planNotificationSwitchChange(');
    expect(hook).toContain('isPreview ||');
  });

  test('a yes to the launch question also turns her profile switch on', async () => {
    const registration = await read(`${src}/lib/use-push-registration.tsx`);
    expect(registration).toContain('await turnOnOwnPushNotifications()');
  });

  test('every language has the screen copy', async () => {
    for (const language of LANGUAGES) {
      const catalog = JSON.parse(
        await read(`${repo}/packages/shared/i18n/locales/${language}/profile.json`),
      ) as { menu: Record<string, string> } & Record<string, unknown>;
      for (const value of [
        catalog.menu.notifications,
        catalog.notificationsSwitch,
        catalog.notificationsBlocked,
        catalog.notificationsOpenSettings,
      ]) {
        expect(typeof value, language).toBe('string');
        expect((value as string).length, language).toBeGreaterThan(0);
        expect(value as string, language).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });

  test('the Catalan copy uses the words the app already uses', async () => {
    const catalog = JSON.parse(
      await read(`${repo}/packages/shared/i18n/locales/ca/profile.json`),
    ) as { menu: Record<string, string> } & Record<string, string>;
    expect(catalog.menu.notifications).toBe('Notificacions');
    const gallery = JSON.parse(
      await read(`${repo}/packages/shared/i18n/locales/ca/gallery.json`),
    ) as Record<string, string>;
    expect(catalog.notificationsOpenSettings).toBe(gallery.openSettings);
  });

  test('her switch is saved by a function that changes only her own row', async () => {
    const migration = await read(
      `${repo}/supabase/migrations/20261123220000_own_push_notifications_switch.sql`,
    );
    expect(migration).toContain(
      'create function public.set_own_push_notifications(p_enabled boolean)',
    );
    expect(migration).toContain('security definer');
    expect(migration).toContain('where id = caller');
    expect(migration).toContain(
      'revoke all on function public.set_own_push_notifications(boolean) from public, anon;',
    );
    const save = await read(`${src}/lib/push-notifications.ts`);
    expect(save).toContain("supabase.rpc('set_own_push_notifications'");
  });
});
