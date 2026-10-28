import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { ImagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import {
  fetchPlayerProfileBanner,
  profileBannerFileSchema,
  savePlayerProfileBanner,
  type PlayerProfileBanner,
} from '@ramassa/shared/participants';
import { uploadFile } from '@ramassa/shared/upload-client';

const DEFAULT_BANNER = '/images/profile-club-banner.webp';

export function PlayerProfileBanner({
  profileId,
  name,
}: {
  readonly profileId: string;
  readonly name: string;
}) {
  const { t } = useTranslation('participants');
  const { session } = useAuth();
  const [banner, setBanner] = useState<PlayerProfileBanner | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = useAuthenticatedMediaUrl(
    banner?.objectKey ?? null,
    mediaWorkerUrl,
    session?.access_token,
  );

  useEffect(() => {
    let active = true;
    setBanner(null);
    void safeAsync(() => fetchPlayerProfileBanner(supabase, profileId)).then((result) => {
      if (active && result.ok) setBanner(result.value);
    });
    return () => {
      active = false;
    };
  }, [profileId, session?.user.id]);

  useEffect(() => {
    setImageReady(false);
    if (file === null) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function changeOpen(next: boolean) {
    if (busy) return;
    setOpen(next);
    setFile(null);
    setAllPlayers(false);
    setError(null);
  }

  async function save() {
    if (file === null || !imageReady || busy) return;
    const parsed = profileBannerFileSchema.safeParse(file);
    if (!parsed.success) {
      setError(t('profileBanner.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await safeAsync(async () => {
      if (!session?.access_token || !mediaWorkerUrl) throw new AppError('AUTH-2');
      const uploaded = await uploadFile({
        mediaWorkerUrl,
        accessToken: session.access_token,
        folder: 'profile-banners',
        file: { data: file, contentType: parsed.data.type, byteLength: file.size },
      });
      if (!uploaded.ok) throw uploaded.error;
      return savePlayerProfileBanner(supabase, profileId, uploaded.value.objectKey, allPlayers);
    });
    setBusy(false);
    if (!result.ok) {
      setError(t('profileBanner.failed'));
      return;
    }
    setBanner(result.value);
    setOpen(false);
    setFile(null);
  }

  return (
    <>
      <img
        src={imageUrl ?? DEFAULT_BANNER}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full object-cover"
      />
      {imageUrl !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-primary/50"
        />
      ) : null}
      {banner?.canEdit ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => changeOpen(true)}
          className="absolute end-5 bottom-4 border-primary-foreground/40 bg-primary/60 text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          data-testid="profile-banner-edit"
        >
          <ImagePlus aria-hidden />
          {t('profileBanner.change')}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profileBanner.change')}</DialogTitle>
            <DialogDescription>{t('profileBanner.format')}</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[4/1] overflow-hidden rounded-lg bg-primary">
            <img
              src={preview ?? imageUrl ?? DEFAULT_BANNER}
              alt={t('profileBanner.preview')}
              className="size-full object-cover"
              onLoad={() => {
                if (preview !== null) setImageReady(true);
              }}
              onError={() => {
                if (preview !== null) {
                  setImageReady(false);
                  setError(t('profileBanner.invalid'));
                }
              }}
            />
            <div className="absolute inset-0 flex items-center bg-primary/50 px-6 text-lg font-semibold text-primary-foreground">
              {name}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-banner-file">{t('profileBanner.image')}</Label>
            <Input
              id="profile-banner-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setError(null);
                if (selected !== null && !profileBannerFileSchema.safeParse(selected).success) {
                  setFile(null);
                  setError(t('profileBanner.invalid'));
                  event.target.value = '';
                  return;
                }
                setFile(selected);
              }}
            />
          </div>
          <fieldset disabled={busy} className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t('profileBanner.applyTo')}</legend>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
              <input
                type="radio"
                name="banner-scope"
                checked={!allPlayers}
                onChange={() => setAllPlayers(false)}
                className="accent-primary"
              />
              {t('profileBanner.thisPlayer')}
            </label>
            {banner?.canApplyAll ? (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="banner-scope"
                  checked={allPlayers}
                  onChange={() => setAllPlayers(true)}
                  className="accent-primary"
                />
                {t('profileBanner.allPlayers')}
              </label>
            ) : null}
          </fieldset>
          {allPlayers ? (
            <p className="rounded-lg bg-muted p-3 text-sm">{t('profileBanner.allWarning')}</p>
          ) : null}
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>
              {t('profileBanner.cancel')}
            </Button>
            <Button disabled={file === null || !imageReady || busy} onClick={() => void save()}>
              {t(
                busy
                  ? 'profileBanner.saving'
                  : allPlayers
                    ? 'profileBanner.saveAll'
                    : 'profileBanner.save',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
