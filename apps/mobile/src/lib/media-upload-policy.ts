import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { UploadContentType } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';
import type { UploadFileContent } from '@ramassa/shared/upload-client';

const MIN_UPLOAD_PROGRESS = 0;
const MAX_UPLOAD_PROGRESS = 1;

export function requireGalleryWriteOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}

export interface MediaUploadDraft {
  readonly sourceUri: string;
  readonly sourceKind: 'image' | 'video';
  readonly mimeType: UploadContentType;
  readonly width: number;
  readonly height: number;
  readonly pickerFileSize: number | null;
}

interface VideoPreparationDependencies {
  readonly readBytes: (uri: string) => Promise<Uint8Array>;
}

export async function prepareNativeGalleryVideoWithDependencies(
  draft: MediaUploadDraft,
  dependencies: VideoPreparationDependencies,
): Promise<UploadFileContent> {
  if (draft.sourceKind !== 'video') throw new AppError('UPLOAD-2');
  if (draft.pickerFileSize !== null && draft.pickerFileSize > tokens.upload.maxVideoBytes) {
    throw new AppError('UPLOAD-3');
  }
  const bytes = await dependencies.readBytes(draft.sourceUri);
  if (bytes.byteLength > tokens.upload.maxVideoBytes) throw new AppError('UPLOAD-3');
  return { data: bytes, byteLength: bytes.byteLength, contentType: draft.mimeType };
}

export type MediaUploadState =
  | {
      readonly status: 'idle';
      readonly draft: null;
      readonly progress: typeof MIN_UPLOAD_PROGRESS;
      readonly errorCode: null;
    }
  | {
      readonly status: 'failed';
      readonly draft: MediaUploadDraft | null;
      readonly progress: number;
      readonly errorCode: AppErrorCode;
    }
  | {
      readonly status: 'selected' | 'uploading' | 'completed';
      readonly draft: MediaUploadDraft;
      readonly progress: number;
      readonly errorCode: null;
    };

export const initialMediaUploadState: MediaUploadState = {
  status: 'idle',
  draft: null,
  progress: MIN_UPLOAD_PROGRESS,
  errorCode: null,
};

export type MediaUploadAction =
  | { readonly type: 'selected'; readonly draft: MediaUploadDraft }
  | { readonly type: 'started' | 'retry' }
  | { readonly type: 'progress'; readonly value: number }
  | { readonly type: 'failed'; readonly errorCode: AppErrorCode }
  | { readonly type: 'completed' }
  | { readonly type: 'reset' };

export function mediaUploadReducer(
  state: MediaUploadState,
  action: MediaUploadAction,
): MediaUploadState {
  if (action.type === 'reset') return initialMediaUploadState;
  if (action.type === 'selected') {
    return {
      status: 'selected',
      draft: action.draft,
      progress: MIN_UPLOAD_PROGRESS,
      errorCode: null,
    };
  }
  if (action.type === 'failed') {
    return { ...state, status: 'failed', errorCode: action.errorCode };
  }
  if (state.draft === null) return state;
  if (action.type === 'started' || action.type === 'retry') {
    return {
      status: 'uploading',
      draft: state.draft,
      progress: MIN_UPLOAD_PROGRESS,
      errorCode: null,
    };
  }
  if (action.type === 'progress') {
    return {
      ...state,
      progress: Math.max(
        state.progress,
        Math.min(MAX_UPLOAD_PROGRESS, Math.max(MIN_UPLOAD_PROGRESS, action.value)),
      ),
    };
  }
  return {
    status: 'completed',
    draft: state.draft,
    progress: MAX_UPLOAD_PROGRESS,
    errorCode: null,
  };
}
