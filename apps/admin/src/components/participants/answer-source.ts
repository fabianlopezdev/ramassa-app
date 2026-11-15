/**
 * Who gave an answer and when, as her page writes it (RAPP-653):
 * "Ella mateixa · 12 oct", "Creu Roja (entitat) · 3 oct",
 * "Marta Puig · 20 oct". An answer from before RAPP-653 names nobody, and
 * reads as the kind of source and the date.
 */

import { shortDate } from '@/components/profile-layout/profile-field-row';
import type { TFunction } from 'i18next';
import type { AnswerOrigin } from '@ramassa/shared/participants';

export function answerSourceText(origin: AnswerOrigin, t: TFunction, locale: string): string {
  const who =
    origin.source === 'player'
      ? t('participants:fitxa.sourcePlayer')
      : origin.source === 'entity'
        ? origin.answeredByName === null
          ? t('participants:fitxa.sourceEntityUnknown')
          : t('participants:fitxa.sourceEntity', { name: origin.answeredByName })
        : (origin.answeredByName ?? t('participants:fitxa.sourceStaffUnknown'));
  return `${who} · ${shortDate(origin.answeredAt, locale)}`;
}
