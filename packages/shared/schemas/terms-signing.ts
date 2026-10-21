import { z } from 'zod';
import { signatureStrokesSchema } from '../equipment/handover';

/** App terms and the photo/video decision have their own signed record. */
export const termsSigningSchema = z
  .object({
    termsAccepted: z.literal(true),
    mediaConsent: z.boolean(),
    strokes: signatureStrokesSchema.nullable(),
    unableToDraw: z.boolean(),
  })
  .refine((value) => (value.unableToDraw ? value.strokes === null : value.strokes !== null), {
    path: ['strokes'],
    message: 'signature required',
  });

export type TermsSigning = z.infer<typeof termsSigningSchema>;

export function termsSigningPayload(value: TermsSigning, device: string) {
  return {
    terms_accepted: value.termsAccepted,
    media_consent: value.mediaConsent,
    signature: value.strokes,
    unable_to_draw: value.unableToDraw,
    device,
  };
}
