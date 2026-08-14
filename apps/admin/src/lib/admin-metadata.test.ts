import { describe, expect, test } from 'bun:test';
import { ADMIN_META_DESCRIPTION } from './admin-metadata';

describe('admin document metadata', () => {
  test('provides a concise description for browser and search surfaces', () => {
    expect(ADMIN_META_DESCRIPTION.length).toBeGreaterThanOrEqual(50);
    expect(ADMIN_META_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(ADMIN_META_DESCRIPTION).toContain('Ramassà');
  });
});
