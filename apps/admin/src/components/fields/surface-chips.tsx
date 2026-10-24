/**
 * Where a field is asked, as small chips (RAPP-650): App (her onboarding),
 * Entity (the referral form) and Season (each re-registration). A field no
 * surface asks shows one dashed "Team only" chip: the team fills it in on her
 * page.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ProfileSurface } from '@ramassa/shared/intake-builder';

export function SurfaceChips({
  surfaces,
  className,
}: {
  readonly surfaces: readonly ProfileSurface[];
  readonly className?: string;
}) {
  const { t } = useTranslation('settings');
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      {surfaces.length === 0 ? (
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          {t('profileLayout.surface.teamOnly')}
        </Badge>
      ) : (
        surfaces.map((surface) => (
          <Badge key={surface} variant="outline" className="text-muted-foreground">
            {t(`profileLayout.surface.${surface}`)}
          </Badge>
        ))
      )}
    </span>
  );
}
