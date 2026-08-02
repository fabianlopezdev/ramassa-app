import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  EQUIPMENT_ITEMS,
  equipmentDeliverySchema,
  equipmentItemTakesSize,
  SIZELESS_EQUIPMENT_ITEMS,
} from './equipment';

/**
 * The item catalog as the DATABASE will enforce it, read from the migrations on
 * disk.
 *
 * Read from FILES rather than by asking the running database, which is what the
 * first version did. `bun test` does not reliably capture a child CLI's output
 * in this repo (`tests/supabase-rls.test.ts` says so in its own comment), so the
 * `docker ps` lookup came back empty, the guard clause returned early, and the
 * test passed while the two catalogs genuinely disagreed. It was a check that
 * could not fail, in the file whose entire job is detecting drift.
 *
 * Every migration is scanned and the LAST definition wins, so a later migration
 * that alters the constraint is what this compares against rather than the
 * original one.
 */
function catalogInMigrations(): readonly string[] {
  const directory = join(import.meta.dir, '../../../supabase/migrations');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let latest: readonly string[] | undefined = undefined;
  for (const file of files) {
    const sql = readFileSync(join(directory, file), 'utf8');
    const constraint = /item text not null check\s*\(([\s\S]*?)\)\s*,/.exec(sql);
    if (constraint === null) continue;
    latest = [...constraint[1]!.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
  }
  if (latest === undefined) {
    throw new Error('No equipment item check constraint found in any migration');
  }
  return latest;
}

describe('the equipment catalog', () => {
  /**
   * THE DRIFT TEST. The catalog exists twice on purpose: a TypeScript enum so
   * the form can offer a picker, and a check constraint so a client that skips
   * the picker is still refused. Two copies of a list is exactly how one of them
   * quietly gains an item the other rejects, and the symptom would be a delivery
   * the form accepts and the database throws out, in front of a staff member.
   */
  test('every item the database accepts is one the picker offers, and vice versa', () => {
    expect([...catalogInMigrations()].sort()).toEqual([...EQUIPMENT_ITEMS].sort());
  });

  test('every sizeless item is a real item', () => {
    for (const item of SIZELESS_EQUIPMENT_ITEMS) {
      expect(EQUIPMENT_ITEMS).toContain(item);
      expect(equipmentItemTakesSize(item)).toBe(false);
    }
  });

  test('boots take a size', () => {
    expect(equipmentItemTakesSize('boots')).toBe(true);
  });
});

describe('equipmentDeliverySchema', () => {
  const valid = { item: 'boots', size: '38', deliveredOn: '2026-08-01' };

  test('a complete delivery is accepted', () => {
    expect(equipmentDeliverySchema.safeParse(valid).success).toBe(true);
  });

  /**
   * The season report is asked which sizes ran out, so an item that has a size
   * must carry one. Without this the form would happily record a pair of boots
   * nobody can count.
   */
  test('boots without a size are refused, and the error lands on the size field', () => {
    const result = equipmentDeliverySchema.safeParse({ ...valid, size: '' });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual(['size']);
  });

  test('a water bottle without a size is fine', () => {
    const result = equipmentDeliverySchema.safeParse({
      item: 'water_bottle',
      deliveredOn: '2026-08-01',
    });
    expect(result.success).toBe(true);
  });

  test('an item outside the catalog is refused', () => {
    expect(equipmentDeliverySchema.safeParse({ ...valid, item: 'hoverboard' }).success).toBe(false);
  });

  test('a note longer than the column allows is refused before it reaches the database', () => {
    const result = equipmentDeliverySchema.safeParse({ ...valid, note: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
