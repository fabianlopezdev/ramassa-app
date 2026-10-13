/**
 * The page the desk's QR code opens on the phone (RAPP-254). Signed in as the
 * person who asked, it offers the Ramassà app, or takes the photo here with
 * the phone's camera, uploads it, and completes the handoff. Anyone else, an
 * expired code or a used one gets a plain sentence and no camera.
 */
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { compressBrowserImage } from '@ramassa/shared/image-compression';
import {
  completePhotoHandoff,
  fetchPhotoHandoff,
  photoHandoffAppLink,
  photoHandoffState,
} from '@ramassa/shared/photo-handoff';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import { uploadFile } from '@ramassa/shared/upload-client';

export const Route = createFileRoute('/_staff/photo-handoff/$handoffId')({
  ssr: false,
  loader: ({ params }) => fetchPhotoHandoff(supabase, params.handoffId),
  component: PhotoHandoffPage,
});

function PhotoHandoffPage() {
  const { t } = useTranslation('settings');
  const handoff = Route.useLoaderData();
  const { handoffId } = Route.useParams();
  const { session } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const state = handoff === null ? 'missing' : photoHandoffState(handoff);

  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined || session === null || mediaWorkerUrl.length === 0) return;
    setStatus('sending');
    try {
      const image = await compressBrowserImage({
        data: file,
        contentType: uploadContentTypeSchema.parse(file.type),
        byteLength: file.size,
      });
      const uploaded = await uploadFile({
        mediaWorkerUrl,
        accessToken: session.access_token,
        folder: 'documents',
        file: image,
      });
      if (!uploaded.ok) throw uploaded.error;
      await completePhotoHandoff(supabase, {
        id: handoffId,
        objectKey: uploaded.value.objectKey,
        contentType: image.contentType,
        fileSize: image.byteLength,
      });
      setStatus('sent');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 p-6" data-testid="photo-handoff-page">
      <h1 className="text-2xl font-bold">{t('handoff.pageTitle')}</h1>
      {state === 'missing' ? <p role="alert">{t('handoff.notFound')}</p> : null}
      {state === 'expired' ? <p role="alert">{t('handoff.pageExpired')}</p> : null}
      {state === 'done' && status !== 'sent' ? <p role="alert">{t('handoff.pageUsed')}</p> : null}
      {status === 'sent' ? (
        <p role="status" data-testid="photo-handoff-sent">
          {t('handoff.sent')}
        </p>
      ) : null}
      {state === 'open' && handoff !== null && status !== 'sent' ? (
        <>
          <p>{t('handoff.pageIntro', { name: handoff.documentName })}</p>
          <Button asChild variant="outline">
            <a href={photoHandoffAppLink(handoffId)}>{t('handoff.openApp')}</a>
          </Button>
          <label className="grid gap-2">
            <span className="font-medium">{t('handoff.takeHere')}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={status === 'sending'}
              onChange={(event) => void send(event)}
              data-testid="photo-handoff-file"
            />
          </label>
          {status === 'sending' ? <p role="status">{t('handoff.uploading')}</p> : null}
          {status === 'failed' ? <p role="alert">{t('handoff.sendFailed')}</p> : null}
        </>
      ) : null}
    </main>
  );
}
