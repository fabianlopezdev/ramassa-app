/**
 * A field's privacy level as a badge (RAPP-650): who on the team reads its
 * answers, in one word (Normal, Personal, Sensitive), coloured by how closely
 * it is guarded. The level itself is enforced by the database.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { QuestionPrivacy } from '@ramassa/shared/intake-builder';

const LEVEL_CLASSES: Readonly<Record<QuestionPrivacy, string>> = {
  normal: 'bg-muted text-foreground',
  personal: 'bg-primary/10 text-primary',
  sensitive: 'bg-destructive/10 text-destructive',
};

export function PrivacyBadge({
  level,
  className,
}: {
  readonly level: QuestionPrivacy;
  readonly className?: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <Badge variant="muted" className={cn(LEVEL_CLASSES[level], className)}>
      {t(`questions.privacyLevels.${level}`)}
    </Badge>
  );
}
