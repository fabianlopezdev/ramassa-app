import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('Les meves dades opens on her photo, which collapses to a band (RAPP-960)', () => {
  test('her photo or her initials head the screen, with her name and the photo pencil', async () => {
    const screen = await read('../app/(app)/profile-data.tsx');

    expect(screen).toContain('<CollapsingHeroScreen');
    expect(screen).toContain('photo={heroPhoto}');
    expect(screen).toContain('useSectionWash(SECTION_BRAND_COLOR)');
    expect(screen).toContain('testID="profile-initials"');
    expect(screen).toContain('<ProfilePhotoEditor profile={profile} badgeOnly />');
    expect(screen).not.toContain('ProfileNameBox');
  });

  test('the profile menu keeps its own frame', async () => {
    const menu = await read('../app/(app)/profile.tsx');

    expect(menu).toContain('<ProfileScreenFrame');
    expect(menu).not.toContain('CollapsingHeroScreen');
  });

  test('the top shrinks with the scroll to a band and never below it', async () => {
    const hero = await read('../components/layout/collapsing-hero-screen.tsx');

    expect(hero).toContain('height: Math.max(minHeight, fullHeight - scrollY.get()),');
    expect(hero).toContain('minHeight: screenHeight + collapse,');
    expect(hero).toContain('pointerEvents="box-none"');
    expect(hero).toContain('numberOfLines={1}');
  });
});
