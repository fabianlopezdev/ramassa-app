import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('the profile opens on her photo with her name on it (RAPP-960)', () => {
  test('her photo is the hero and her full name is the heading on it', async () => {
    const profile = await read('../app/(app)/profile.tsx');

    expect(profile).toContain('<PhotoHeroScreen');
    expect(profile).toContain('overlay={title}');
    expect(profile).toContain('testID="profile-name"');
    expect(profile).not.toContain('ProfileScreenFrame');
  });

  test('with no photo, her initials stand on the soft brand blue', async () => {
    const profile = await read('../app/(app)/profile.tsx');

    expect(profile).toContain('<PanelHeroScreen');
    expect(profile).toContain('useSectionWash(SECTION_BRAND_COLOR)');
    expect(profile).toContain('testID="profile-initials"');
    expect(profile).toContain('onPanel={source === null}');
  });

  test('the title on a photo clears the sheet and reads on any picture', async () => {
    const hero = await read('../components/layout/photo-hero.tsx');

    expect(hero).toContain('paddingBottom: SHEET_CORNER_RADIUS + tokens.spacing.md,');
    expect(hero).toContain('accessibilityRole="header"');
    expect(hero).toContain('{overlay}');
  });
});
