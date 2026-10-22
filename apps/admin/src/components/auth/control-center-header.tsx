/**
 * The top of every login screen (RAPP-626): the organization logo, as uploaded
 * in Settings and served publicly by the media worker (the same link the player
 * app's first screen uses), then the Control Center title. The logo keeps its
 * space and fades in once loaded, and a missing logo leaves no broken image.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface ControlCenterHeaderProps {
  readonly title: string;
  /** The public logo link (`publicOrganizationLogoUrl`); null shows no logo. */
  readonly logoUrl?: string | null;
  readonly children?: ReactNode;
}

export function ControlCenterHeader({ title, logoUrl = null, children }: ControlCenterHeaderProps) {
  const { t } = useTranslation('common');
  const [logoState, setLogoState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  // A server-rendered image can finish loading before React attaches onLoad,
  // so a finished image is also picked up once it mounts. A failure is left to
  // onError, because `complete` alone does not mean the load went wrong.
  const settleIfAlreadyLoaded = useCallback((image: HTMLImageElement | null) => {
    if (image !== null && image.complete && image.naturalWidth > 0) setLogoState('loaded');
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {logoUrl !== null && logoState !== 'failed' ? (
        <img
          ref={settleIfAlreadyLoaded}
          src={logoUrl}
          alt={t('appName')}
          data-testid="control-center-logo"
          data-loaded={logoState === 'loaded'}
          onLoad={() => setLogoState('loaded')}
          onError={() => setLogoState('failed')}
          className={`mb-2 h-24 w-auto max-w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 ${logoState === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
      <h1 className="text-2xl font-bold text-primary">{title}</h1>
      {children}
    </div>
  );
}
