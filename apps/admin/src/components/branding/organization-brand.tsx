/**
 * The organization's brand block (RAPP-631): its logo on a white tile beside
 * its name, at the top of the staff sidebar and the entity portal bar. The
 * tile keeps any logo legible on the brand-coloured navigation, and an
 * organization without a logo shows its initials in the same tile. The logo
 * comes from Settings through the authenticated media worker, as before.
 */
import { useAdminBranding } from '@/components/branding/organization-branding-provider';
import { AuthenticatedMediaImage } from '@/components/content/authenticated-media-image';
import { organizationInitials } from '@/lib/initials';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';

export function OrganizationLogoTile({ className }: { readonly className?: string }) {
  const { t } = useTranslation('common');
  const { session } = useAuth();
  const organization = useAdminBranding();
  const name = organization?.name ?? t('appName');
  const logoUrl = organization?.logo_url ?? null;
  return (
    <span
      data-testid="organization-logo-tile"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5',
        className,
      )}
    >
      {logoUrl !== null && session !== null ? (
        <AuthenticatedMediaImage
          objectKeyOrUrl={logoUrl}
          mediaWorkerUrl={mediaWorkerUrl}
          accessToken={session.access_token}
          alt={name}
          className="size-full object-contain"
        />
      ) : (
        <span aria-hidden="true" className="text-sm font-bold text-primary">
          {organizationInitials(name)}
        </span>
      )}
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
