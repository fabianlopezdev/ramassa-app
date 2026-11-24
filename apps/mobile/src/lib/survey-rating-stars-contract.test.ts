import { describe, expect, test } from 'bun:test';
import { motionTokens } from '@ramassa/shared/tokens/motion';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe('survey stars are the club colour and fill up to the one tapped (RAPP-963)', () => {
  test('every star up to the chosen rating is filled, on a yellow card in step with it', async () => {
    const screen = await read('../app/(app)/survey/[id].tsx');

    expect(screen).toContain('<RatingStar');
    expect(screen).toContain('isFilled={chosenRating !== null && rating <= chosenRating}');
    expect(screen).toContain('isWashed={chosenRating !== null && rating <= chosenRating}');
    expect(screen).toContain('washDelayMs={ratingFillDelayMs(rating - 1)}');
    // The screen reader still hears the one chosen.
    expect(screen).toContain('isSelected={answer === rating}');
    expect(screen).not.toContain('tokens.colors.secondary.dark');
  });

  test('the star is drawn in the club colour and pops in turn, still under reduced motion', async () => {
    const star = await read('../components/surveys/rating-star.tsx');

    expect(star).toContain('useBrandColor()');
    expect(star).toContain('const delay = ratingFillDelayMs(order);');
    expect(star).toContain('if (isReducedMotion) {');
    expect(motionTokens.ratingFill.staggerMs).toBeGreaterThan(0);
    expect(motionTokens.ratingFill.peakScale).toBeGreaterThan(1);
  });
});
