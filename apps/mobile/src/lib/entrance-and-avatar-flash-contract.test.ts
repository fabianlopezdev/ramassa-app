import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('nothing flashes while a screen arrives or rebuilds', () => {
  test('Android draws a fading screen as one picture, so cards keep their white face (RAPP-976)', async () => {
    const entrance = await read('../components/motion/screen-entrance.tsx');
    expect(entrance).toContain('needsOffscreenAlphaCompositing={isMoving}');
    expect(entrance).toContain('renderToHardwareTextureAndroid={isMoving}');
  });

  test('a photo already shown comes back without the fade or the icon under it (RAPP-977)', async () => {
    const avatar = await read('../components/people/person-avatar.tsx');
    expect(avatar).toContain('transition={wasShown ? 0 : 150}');
    expect(avatar).toContain("{wasShown ? null : fallback === 'person' ? (");
    expect(avatar).toContain('onDisplay={rememberShown}');
  });
});
