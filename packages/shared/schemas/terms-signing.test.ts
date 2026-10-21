import { expect, test } from 'bun:test';
import { termsSigningPayload, termsSigningSchema } from './terms-signing';

test('app terms signature keeps media permission optional and requires explicit acceptance', () => {
  const signing = {
    termsAccepted: true,
    mediaConsent: false,
    strokes: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
    unableToDraw: false,
  };
  expect(termsSigningSchema.safeParse(signing).success).toBe(true);
  expect(termsSigningSchema.safeParse({ ...signing, termsAccepted: false }).success).toBe(false);
  expect(termsSigningSchema.safeParse({ ...signing, strokes: null }).success).toBe(false);
  expect(
    termsSigningSchema.safeParse({ ...signing, strokes: null, unableToDraw: true }).success,
  ).toBe(true);
  expect(termsSigningSchema.safeParse({ ...signing, strokes: [[[1001, 2]]] }).success).toBe(false);
  expect(termsSigningPayload(termsSigningSchema.parse(signing), 'ios 27')).toEqual({
    terms_accepted: true,
    media_consent: false,
    signature: [
      [
        [1, 2],
        [3, 4],
      ],
    ],
    unable_to_draw: false,
    device: 'ios 27',
  });
});
