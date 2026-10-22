/**
 * Her own profile photo (RAPP-633): choose, replace or remove it, on her
 * account page (RAPP-634) or, in the entity portal, in a dialog from the user
 * menu. The image is compressed in the browser and uploaded through the
 * media worker to the `profile-photos` folder, whose key the worker chooses
 * from her verified identity; her profile row then stores that key, the same
 * column a participant's photo uses. Without a photo the menu shows initials.
 */
import { AccountAvatar } from '@/components/nav/account-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { setOwnAvatar, type OwnAccount } from '@/lib/own-account';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { AppError } from '@ramassa/shared/errors';
import { compressBrowserImage } from '@ramassa/shared/image-compression';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import { uploadFile } from '@ramassa/shared/upload-client';

type PhotoStatus = 'idle' | 'working' | 'saved' | 'removed' | 'failed' | 'wrong-type';

export interface ProfilePhotoDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly account: OwnAccount;
  /** Reads her account again so the top bar shows the new photo. */
  readonly onChanged: () => void;
}

async function uploadProfilePhoto(file: File): Promise<string> {
  if (mediaWorkerUrl.length === 0) throw new AppError('UPLOAD-1');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session === null) throw new AppError('AUTH-2');
  const contentType = uploadContentTypeSchema.parse(file.type);
  const result = await uploadFile({
    mediaWorkerUrl,
    accessToken: data.session.access_token,
    folder: 'profile-photos',
    file: { data: file, contentType, byteLength: file.size },
    prepareFile: compressBrowserImage,
  });
  if (!result.ok) throw result.error;
  return result.value.objectKey;
}

export interface ProfilePhotoEditorProps {
  readonly account: OwnAccount;
  /** Reads her account again so the top bar shows the new photo. */
  readonly onChanged: () => void;
  /** `inline` puts the buttons beside the photo, for the account page (RAPP-634). */
  readonly layout?: 'stacked' | 'inline';
}

/** Choose, replace or remove her photo; the dialog and the account page share it. */
export function ProfilePhotoEditor({
  account,
  onChanged,
  layout = 'stacked',
}: ProfilePhotoEditorProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const input = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<PhotoStatus>('idle');
  const working = status === 'working';
  const inline = layout === 'inline';

  const save = async (avatarUrl: () => Promise<string | null>, done: PhotoStatus) => {
    if (userId === null) return;
    setStatus('working');
    const result = await safeAsync(async () => setOwnAvatar(userId, await avatarUrl()), {
      context: { action: 'own-profile-photo' },
    });
    setStatus(result.ok ? done : 'failed');
    if (result.ok) onChanged();
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const type = uploadContentTypeSchema.safeParse(file.type);
    if (!type.success || !type.data.startsWith('image/')) {
      setStatus('wrong-type');
      return;
    }
    void save(() => uploadProfilePhoto(file), 'saved');
  };

  const message =
    status === 'working'
      ? t('admin:profilePhoto.working')
      : status === 'saved'
        ? t('admin:profilePhoto.saved')
        : status === 'removed'
          ? t('admin:profilePhoto.removed')
          : null;
  const problem =
    status === 'failed'
      ? t('admin:profilePhoto.failed')
      : status === 'wrong-type'
        ? t('admin:profilePhoto.wrongType')
        : null;

  return (
    <div
      className={cn(
        'flex gap-4',
        inline
          ? 'flex-col items-start sm:flex-row sm:items-center sm:gap-6'
          : 'flex-col items-center py-2',
      )}
    >
      <AccountAvatar
        account={account}
        className={cn('ring-4 ring-primary/10', inline ? 'size-20' : 'size-28')}
        fallbackClassName={inline ? 'text-2xl' : 'text-3xl'}
      />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="profile-photo-input"
        onChange={onFile}
      />
      <div className={cn('flex flex-col gap-2', inline ? 'items-start' : 'items-center')}>
        <div className={cn('flex flex-wrap gap-2', inline ? 'justify-start' : 'justify-center')}>
          <Button
            type="button"
            size="lg"
            disabled={working}
            data-testid="profile-photo-choose"
            onClick={() => input.current?.click()}
          >
            <Camera aria-hidden="true" />
            {account.avatarUrl === null
              ? t('admin:profilePhoto.choose')
              : t('admin:profilePhoto.replace')}
          </Button>
          {account.avatarUrl === null ? null : (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={working}
              data-testid="profile-photo-remove"
              onClick={() => void save(async () => null, 'removed')}
            >
              <Trash2 aria-hidden="true" />
              {t('admin:profilePhoto.remove')}
            </Button>
          )}
        </div>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {message}
        </p>
        {problem === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

/** The photo in a dialog, from the entity portal's user menu. */
export function ProfilePhotoDialog({
  open,
  onOpenChange,
  account,
  onChanged,
}: ProfilePhotoDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  // A fresh editor each time the dialog opens, so an old message never shows.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="profile-photo-dialog">
        <DialogTitle>{t('admin:userMenu.profilePhoto')}</DialogTitle>
        <DialogDescription>{t('admin:profilePhoto.description')}</DialogDescription>
        {open ? <ProfilePhotoEditor account={account} onChanged={onChanged} /> : null}
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('common:close')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
