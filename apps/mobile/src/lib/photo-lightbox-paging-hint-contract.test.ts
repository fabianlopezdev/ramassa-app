import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('the photo viewer shows there are more photos (RAPP-962)', () => {
  test('a counter and an arrow on each side, only with more than one photo', async () => {
    const lightbox = await read('../components/media/photo-lightbox.tsx');

    expect(lightbox).toContain('const hasPages = pageCount > 1;');
    expect(lightbox).toContain('testID="photo-lightbox-counter"');
    expect(lightbox).toContain('{`${currentIndex + 1} / ${pageCount}`}');
    expect(lightbox).toContain("t('photoViewer.position'");
    // No arrow back from the first photo, none forward from the last.
    expect(lightbox).toContain('hasPages && currentIndex > 0 ?');
    expect(lightbox).toContain('hasPages && currentIndex < pageCount - 1 ?');
    // The arrows mirror in Arabic and Farsi.
    expect(lightbox).toContain('icon={BACKWARD_CHEVRON}');
    expect(lightbox).toContain('icon={FORWARD_CHEVRON}');
  });

  test('the arrows turn the page the way a swipe does, and hide with the overlay', async () => {
    const lightbox = await read('../components/media/photo-lightbox.tsx');

    expect(lightbox).toContain('onPress={turnBack}');
    expect(lightbox).toContain('onPress={turnForward}');
    expect(lightbox).toContain('turnPage(nativeEvent.actionName');
    expect(lightbox).toContain("const pagingPointerEvents = isOverlayShown ? 'box-none' : 'none';");
  });
});
