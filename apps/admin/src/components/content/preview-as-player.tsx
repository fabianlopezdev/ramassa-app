/**
 * "Preview as player" in the web admin (RAPP-372), for every team member: the
 * whole player app from the sidebar, or one published item from its page. An
 * item players cannot see yet says so instead, because the preview shows only
 * what players see. Hidden when the player web address is not configured.
 */
import { Button } from '@/components/ui/button';
import { isPlayerPreviewAvailable, openPlayerPreview } from '@/lib/player-preview';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function PreviewAsPlayer({
  target,
  isVisibleToPlayers = true,
  variant = 'outline',
  className,
}: {
  /** The item's player screen, such as `/announcement/<id>`, or none for the app. */
  readonly target: string | null;
  readonly isVisibleToPlayers?: boolean;
  readonly variant?: 'outline' | 'ghost';
  readonly className?: string;
}) {
  const { t } = useTranslation('common');
  const [isOpening, setIsOpening] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  if (!isPlayerPreviewAvailable()) return null;
  if (!isVisibleToPlayers) {
    return (
      <p data-testid="admin-preview-unpublished" className="text-sm text-muted-foreground">
        {t('previewNotPublished')}
      </p>
    );
  }
  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        data-testid={target === null ? 'admin-preview-app' : 'admin-preview-as-player'}
        disabled={isOpening}
        onClick={() => {
          setIsOpening(true);
          setHasFailed(false);
          void openPlayerPreview(target).then((result) => {
            setIsOpening(false);
            setHasFailed(!result.ok);
          });
        }}
      >
        {t('previewAsPlayer')}
      </Button>
      {hasFailed ? (
        <p
          role="alert"
          data-testid="admin-preview-failed"
          className="mt-1 text-sm text-destructive"
        >
          {t('previewStartFailed')}
        </p>
      ) : null}
    </div>
  );
}
