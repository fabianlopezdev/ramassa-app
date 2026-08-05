import { Button } from '@/components/ui/button';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

export type ImageUploadState = 'empty' | 'ready' | 'stored' | 'uploading';

export interface ImageUploadFieldProps {
  readonly state: ImageUploadState;
  readonly onSelect: (file: File) => void;
  readonly onRemove: () => void;
  readonly fieldId?: string;
  readonly translationNamespace?: 'announcements' | 'knowledge';
}

export function ImageUploadField({
  state,
  onSelect,
  onRemove,
  fieldId = 'announcement',
  translationNamespace = 'announcements',
}: ImageUploadFieldProps) {
  const { t } = useTranslation(translationNamespace);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file !== undefined) onSelect(file);
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{t('fieldImage')}</legend>
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed px-4 text-sm font-medium hover:bg-muted">
        {t('imageChoose')}
        <input
          className="sr-only"
          type="file"
          data-testid={`${fieldId}-image`}
          accept="image/jpeg,image/png,image/webp"
          disabled={state === 'uploading'}
          onChange={selectImage}
        />
      </label>
      {state === 'uploading' ? (
        <p className="text-sm text-muted-foreground">{t('uploading')}</p>
      ) : null}
      {state === 'ready' ? (
        <p className="text-sm text-muted-foreground">{t('imageReady')}</p>
      ) : null}
      {state === 'stored' ? (
        <p className="text-sm text-muted-foreground">{t('imageStored')}</p>
      ) : null}
      {state === 'ready' || state === 'stored' ? (
        <Button type="button" variant="outline" onClick={onRemove}>
          {t('imageRemove')}
        </Button>
      ) : null}
    </fieldset>
  );
}
