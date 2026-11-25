import { describe, expect, test } from 'bun:test';
import ar from './locales/ar/incidents.json';
import ca from './locales/ca/incidents.json';
import en from './locales/en/incidents.json';
import es from './locales/es/incidents.json';
import fa from './locales/fa/incidents.json';
import fr from './locales/fr/incidents.json';

describe('incidents catalog (RAPP-973)', () => {
  test('all six locales expose the exact same keys', () => {
    const expected = Object.keys(ca).toSorted();
    for (const catalog of [es, en, fr, ar, fa]) {
      expect(Object.keys(catalog).toSorted()).toEqual(expected);
    }
  });

  test('every incident label is a non-empty translated string', () => {
    for (const catalog of [ca, es, en, fr, ar, fa]) {
      for (const value of Object.values(catalog)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('the card says what Larri asked for in Catalan and Spanish', () => {
    expect(ca.title).toBe('Reportar un incident');
    expect(es.title).toBe('Reportar un incidente');
    expect(en.title).toBe('Report an incident');
    expect(fr.title).toBe('Signaler un incident');
  });
});
