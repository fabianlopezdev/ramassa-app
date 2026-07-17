import { describe, expect, test } from 'bun:test';
import { applyDocumentDirection, syncNativeLayoutDirection } from './rtl';

function createFakeLayoutManager(isRTL: boolean) {
  const calls: string[] = [];
  return {
    manager: {
      isRTL,
      allowRTL: (value: boolean) => calls.push(`allowRTL:${value}`),
      forceRTL: (value: boolean) => calls.push(`forceRTL:${value}`),
    },
    calls,
  };
}

describe('syncNativeLayoutDirection (mobile I18nManager)', () => {
  test('switching to Arabic on an LTR layout forces RTL and requires a restart', () => {
    const { manager, calls } = createFakeLayoutManager(false);
    const requiresRestart = syncNativeLayoutDirection(manager, 'ar');
    expect(calls).toContain('allowRTL:true');
    expect(calls).toContain('forceRTL:true');
    expect(requiresRestart).toBe(true);
  });

  test('switching to Farsi on an LTR layout forces RTL', () => {
    const { manager, calls } = createFakeLayoutManager(false);
    expect(syncNativeLayoutDirection(manager, 'fa')).toBe(true);
    expect(calls).toContain('forceRTL:true');
  });

  test('switching to Catalan on an RTL layout forces LTR back', () => {
    const { manager, calls } = createFakeLayoutManager(true);
    expect(syncNativeLayoutDirection(manager, 'ca')).toBe(true);
    expect(calls).toContain('forceRTL:false');
  });

  test('no restart when the layout already matches the language', () => {
    const ltr = createFakeLayoutManager(false);
    expect(syncNativeLayoutDirection(ltr.manager, 'es')).toBe(false);
    expect(ltr.calls).not.toContain('forceRTL:false');

    const rtl = createFakeLayoutManager(true);
    expect(syncNativeLayoutDirection(rtl.manager, 'ar')).toBe(false);
  });
});

// A fake instead of a real DOM keeps this package (tests included) DOM-free;
// `applyDocumentDirection` only relies on the structural `DocumentLike` shape.
function createFakeDocument() {
  const attributes: Record<string, string> = {};
  return {
    target: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    },
    attributes,
  };
}

describe('applyDocumentDirection (web)', () => {
  test('sets dir=rtl and the language on the document element for Arabic', () => {
    const { target, attributes } = createFakeDocument();
    applyDocumentDirection(target, 'ar');
    expect(attributes['dir']).toBe('rtl');
    expect(attributes['lang']).toBe('ar');
  });

  test('sets dir=ltr for Catalan', () => {
    const { target, attributes } = createFakeDocument();
    applyDocumentDirection(target, 'ca');
    expect(attributes['dir']).toBe('ltr');
    expect(attributes['lang']).toBe('ca');
  });
});
