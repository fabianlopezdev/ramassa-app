import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';
import {
  initialMediaUploadState,
  mediaUploadReducer,
  prepareNativeGalleryVideoWithDependencies,
  requireGalleryWriteOnline,
  type MediaUploadDraft,
} from './media-upload-policy';

const draft: MediaUploadDraft = {
  sourceUri: 'file:///clip.mp4',
  sourceKind: 'video',
  mimeType: 'video/mp4',
  width: 720,
  height: 1_280,
  pickerFileSize: tokens.upload.maxVideoBytes,
};

describe('native gallery video policy', () => {
  test('fails immediately offline instead of queueing gallery writes', () => {
    expect(() => requireGalleryWriteOnline(false)).toThrow(new AppError('NETWORK-1'));
  });

  test('accepts exactly 10MB after checking the actual bytes', async () => {
    const prepared = await prepareNativeGalleryVideoWithDependencies(draft, {
      readBytes: async () => new Uint8Array(tokens.upload.maxVideoBytes),
    });
    expect(prepared.byteLength).toBe(tokens.upload.maxVideoBytes);
    expect(prepared.contentType).toBe('video/mp4');
  });

  test('rejects one byte over 10MB even when picker metadata claims it fits', async () => {
    await expect(
      prepareNativeGalleryVideoWithDependencies(draft, {
        readBytes: async () => new Uint8Array(tokens.upload.maxVideoBytes + 1),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'UPLOAD-3' }) as AppError);
  });

  test('rejects immediately when picker metadata is already over the cap', async () => {
    let read = false;
    await expect(
      prepareNativeGalleryVideoWithDependencies(
        { ...draft, pickerFileSize: tokens.upload.maxVideoBytes + 1 },
        {
          readBytes: async () => {
            read = true;
            return new Uint8Array(1);
          },
        },
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'UPLOAD-3' }) as AppError);
    expect(read).toBe(false);
  });
});

describe('media upload retry state', () => {
  test('surfaces an initial selection failure without discarding a prior selection', () => {
    const initialFailure = mediaUploadReducer(initialMediaUploadState, {
      type: 'failed',
      errorCode: 'UPLOAD-2',
    });
    const selected = mediaUploadReducer(initialMediaUploadState, { type: 'selected', draft });
    const replacementFailure = mediaUploadReducer(selected, {
      type: 'failed',
      errorCode: 'UPLOAD-2',
    });

    expect(initialFailure).toEqual({
      status: 'failed',
      draft: null,
      progress: 0,
      errorCode: 'UPLOAD-2',
    });
    expect(replacementFailure).toMatchObject({
      status: 'failed',
      draft,
      errorCode: 'UPLOAD-2',
    });
  });

  test('keeps the selected draft after failure and reuses it on retry', () => {
    const selected = mediaUploadReducer(initialMediaUploadState, { type: 'selected', draft });
    const uploading = mediaUploadReducer(selected, { type: 'started' });
    const failed = mediaUploadReducer(uploading, { type: 'failed', errorCode: 'NETWORK-1' });
    const retrying = mediaUploadReducer(failed, { type: 'retry' });

    expect(failed).toMatchObject({ status: 'failed', draft, errorCode: 'NETWORK-1' });
    expect(retrying).toMatchObject({ status: 'uploading', draft, progress: 0 });
  });

  test('tracks monotonic determinate progress and completes at one', () => {
    const selected = mediaUploadReducer(initialMediaUploadState, { type: 'selected', draft });
    const uploading = mediaUploadReducer(selected, { type: 'started' });
    const halfway = mediaUploadReducer(uploading, { type: 'progress', value: 0.55 });
    const stale = mediaUploadReducer(halfway, { type: 'progress', value: 0.25 });
    const complete = mediaUploadReducer(stale, { type: 'completed' });

    expect(halfway.progress).toBe(0.55);
    expect(stale.progress).toBe(0.55);
    expect(complete).toMatchObject({ status: 'completed', progress: 1 });
  });
});
