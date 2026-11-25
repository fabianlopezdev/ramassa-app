/**
 * The organization's brand block (RAPP-631): the club shield on a white tile
 * beside its name, at the top of the staff sidebar and the entity portal bar.
 * The tile keeps the shield legible on the brand-coloured navigation.
 *
 * The Control Center shows the shield alone, shipped with the dashboard
 * (RAPP-918). The club logo in Settings carries the name under the shield,
 * which the name beside the tile already says, and the phone app keeps using
 * that one.
 *
 * The tile is round, and a shield has two square corners on top and a point
 * below, so a shield centred by its box touches the circle with its corners
 * (RAPP-964). It takes 65% of the tile and sits a tenth of its height lower:
 * there its corners and its tip are the same distance from the edge.
 */
import { useAdminBranding } from '@/components/branding/organization-branding-provider';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const CLUB_SHIELD_SRC = '/images/club-shield.png';

function OrganizationLogoTile({ className }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  const organization = useAdminBranding();
  const name = organization?.name ?? t('appName');
  return (
    <span
      data-testid="organization-logo-tile"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5',
        className,
      )}
    >
      <img src={CLUB_SHIELD_SRC} alt={name} className="h-[65%] w-auto translate-y-[10%]" />
    </span>
  );
}

export interface OrganizationBrandProps {
  /** A quiet second line under the name, such as "Control Center". */
  readonly subtitle?: string;
  readonly className?: string;
  /** Classes for the text column, so a collapsed sidebar can hide it. */
  readonly textClassName?: string;
  readonly tileClassName?: string;
}

export function OrganizationBrand({
  subtitle,
  className,
  textClassName,
  tileClassName,
}: OrganizationBrandProps) {
  const { t } = useTranslation('common');
  const organization = useAdminBranding();
  const name = organization?.name ?? t('appName');
  return (
    <div
      className={cn('flex min-w-0 items-center gap-3', className)}
      data-testid="organization-brand"
    >
      <OrganizationLogoTile className={tileClassName} />
      <span className={cn('grid min-w-0 flex-1 text-start leading-tight', textClassName)}>
        <span className="truncate text-sm font-semibold">{name}</span>
        {subtitle === undefined ? null : (
          <span className="truncate text-xs opacity-75">{subtitle}</span>
        )}
      </span>
    </div>
  );
}
