/**
 * How the names of a pair of half cards fit (RAPP-882). A pair starts at the
 * full name size. A name that breaks inside a word steps both names down to
 * the smaller size, and a name that still breaks there puts the pair one card
 * per row.
 *
 * The level is kept under a fit key: the two names, the row's width and the
 * system text size. A new key starts again at the full size, so another
 * language or a wider screen gets the bigger names back. Under one key the
 * level only goes down, so a pair can never step back up and down in a loop.
 */
export type HalfCardNameLevel = 'full' | 'smaller' | 'rows';

export interface HalfCardNameFit {
  readonly key: string;
  readonly level: HalfCardNameLevel;
}

const LEVEL_AFTER_A_BREAK: Record<Exclude<HalfCardNameLevel, 'rows'>, HalfCardNameLevel> = {
  full: 'smaller',
  smaller: 'rows',
};

export function firstHalfCardNameFit(key: string): HalfCardNameFit {
  return { key, level: 'full' };
}

/** The level a pair is drawn at under `key`. */
export function halfCardNameLevel(fit: HalfCardNameFit, key: string): HalfCardNameLevel {
  return fit.key === key ? fit.level : 'full';
}

/**
 * A name of the pair broke inside a word while drawn at `measuredLevel` under
 * `key`. Only a break at the level the pair is at steps it down: a late report
 * from a level the pair has already left changes nothing.
 */
export function nameBrokeInsideAWord(
  fit: HalfCardNameFit,
  key: string,
  measuredLevel: HalfCardNameLevel,
): HalfCardNameFit {
  const current = fit.key === key ? fit : firstHalfCardNameFit(key);
  if (measuredLevel !== current.level || current.level === 'rows') return current;
  return { key, level: LEVEL_AFTER_A_BREAK[current.level] };
}
