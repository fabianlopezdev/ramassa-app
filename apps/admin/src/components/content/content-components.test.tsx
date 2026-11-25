import { ImageUploadField } from '@/components/content/image-upload-field';
import { MultilingualEditor } from '@/components/content/multilingual-editor';
import { PhotoFocusPicker } from '@/components/content/photo-focus-field';
import { ScheduledPublishFields } from '@/components/content/scheduled-publish-fields';
import { TranslationReviewPanel } from '@/components/content/translation-review-panel';
import { createAdminI18n } from '@/lib/i18n';
import { fireEvent, render } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { I18nextProvider } from 'react-i18next';
import { createTranslationReview } from '@ramassa/shared/translation';

const review = createTranslationReview({
  sourceLanguage: 'ca',
  sourceText: 'Entrenament cancel·lat',
  translations: {
    es: 'Entrenamiento cancelado',
    en: 'Training cancelled',
    ar: 'تم إلغاء التدريب',
    fa: 'تمرین لغو شد',
  },
});

function withI18n(node: React.ReactNode) {
  return render(<I18nextProvider i18n={createAdminI18n('en')}>{node}</I18nextProvider>);
}

test('MultilingualEditor keeps Catalan as source and mirrors RTL per translated field', () => {
  const onSourceChange = mock(() => undefined);
  const onTranslationChange = mock(() => undefined);
  const view = withI18n(
    <MultilingualEditor
      fieldId="title"
      sourceLabel="Catalan title"
      sourceValue="Entrenament cancel·lat"
      review={review}
      maxLength={200}
      onSourceChange={onSourceChange}
      onTranslationChange={onTranslationChange}
    />,
  );

  expect(view.getByTestId('title-source').getAttribute('dir')).toBe('ltr');
  expect(view.getByTestId('title-draft-ar').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('title-draft-fa').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('title-draft-en').getAttribute('maxlength')).toBe('200');
});

test('TranslationReviewPanel exposes per-language and approve-all review actions', () => {
  const onApprove = mock(() => undefined);
  const onReject = mock(() => undefined);
  const onApproveAll = mock(() => undefined);
  const view = withI18n(
    <TranslationReviewPanel
      fieldId="title"
      review={review}
      onApprove={onApprove}
      onReject={onReject}
      onApproveAll={onApproveAll}
    />,
  );

  fireEvent.click(view.getByTestId('title-approve-es'));
  fireEvent.click(view.getByTestId('title-reject-ar'));
  fireEvent.click(view.getByTestId('title-approve-all'));
  expect(onApprove).toHaveBeenCalledWith('es');
  expect(onReject).toHaveBeenCalledWith('ar');
  expect(onApproveAll).toHaveBeenCalledTimes(1);
});

test('ScheduledPublishFields only asks for a publication time in scheduled mode', () => {
  const view = withI18n(
    <ScheduledPublishFields
      mode="draft"
      publishedAt=""
      expiresAt=""
      onModeChange={() => undefined}
      onPublishedAtChange={() => undefined}
      onExpiresAtChange={() => undefined}
    />,
  );
  expect(view.queryByTestId('announcement-published-at')).toBeNull();

  view.rerender(
    <I18nextProvider i18n={createAdminI18n('en')}>
      <ScheduledPublishFields
        mode="scheduled"
        publishedAt="2026-08-12T18:00"
        expiresAt=""
        onModeChange={() => undefined}
        onPublishedAtChange={() => undefined}
        onExpiresAtChange={() => undefined}
      />
    </I18nextProvider>,
  );
  expect(view.getByTestId('announcement-published-at')).not.toBeNull();
});

test('ImageUploadField accepts only the image formats supported by the media pipeline', () => {
  const view = withI18n(
    <ImageUploadField state="empty" onSelect={() => undefined} onRemove={() => undefined} />,
  );
  expect(view.getByTestId('announcement-image').getAttribute('accept')).toBe(
    'image/jpeg,image/png,image/webp',
  );
});

test('PhotoFocusPicker sets the point a click lands on, moves by key, and resets (RAPP-932)', () => {
  const onChange = mock((focus: unknown) => void focus);
  const view = withI18n(
    <PhotoFocusPicker
      photoUrl="blob:local-photo"
      focus={{ x: 0.5, y: 0.2 }}
      onChange={onChange}
      fieldId="announcement"
    />,
  );
  const box = view.getByTestId('announcement-focus');
  box.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 400, height: 200, right: 410, bottom: 220 }) as DOMRect;

  fireEvent.pointerDown(box, { clientX: 110, clientY: 170, pointerId: 1 });
  expect(onChange).toHaveBeenLastCalledWith({ x: 0.25, y: 0.75 });

  fireEvent.keyDown(box, { key: 'ArrowDown' });
  expect(onChange).toHaveBeenLastCalledWith({ x: 0.5, y: 0.25 });

  fireEvent.click(view.getByTestId('announcement-focus-reset'));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test('PhotoFocusPicker shows the default crop and no reset when nothing is chosen', () => {
  const view = withI18n(
    <PhotoFocusPicker
      photoUrl="blob:local-photo"
      focus={null}
      onChange={() => undefined}
      fieldId="service-0"
    />,
  );
  // Until the photo loads its shape is unknown, so the frame shows the card's shape whole.
  expect(view.getByTestId('service-0-focus-frame').style.height).toBe('100%');
  expect(view.queryByTestId('service-0-focus-reset')).toBeNull();
});
