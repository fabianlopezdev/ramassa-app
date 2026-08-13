import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { UploadContentType } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';
import type { UploadFileContent } from '@ramassa/shared/upload-client';

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
      readonly progress: 0;
      readonly errorCode: null;
    }
  | {
      readonly status: 'selected' | 'uploading' | 'failed' | 'completed';
      readonly draft: MediaUploadDraft;
      readonly progress: number;
      readonly errorCode: AppErrorCode | null;
    };

export const initialMediaUploadState: MediaUploadState = {
  status: 'idle',
  draft: null,
  progress: 0,
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
    return { status: 'selected', draft: action.draft, progress: 0, errorCode: null };
  }
  if (state.draft === null) return state;
  if (action.type === 'started' || action.type === 'retry') {
    return { status: 'uploading', draft: state.draft, progress: 0, errorCode: null };
  }
  if (action.type === 'progress') {
    return { ...state, progress: Math.max(state.progress, Math.min(1, Math.max(0, action.value))) };
  }
  if (action.type === 'failed') {
    return { ...state, status: 'failed', errorCode: action.errorCode };
  }
  return { status: 'completed', draft: state.draft, progress: 1, errorCode: null };
}
