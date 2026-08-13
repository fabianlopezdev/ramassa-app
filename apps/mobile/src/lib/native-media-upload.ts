import { File } from 'expo-file-system';
import {
  prepareNativeGalleryVideoWithDependencies,
  type MediaUploadDraft,
} from './media-upload-policy';

export function prepareNativeGalleryVideo(draft: MediaUploadDraft) {
  return prepareNativeGalleryVideoWithDependencies(draft, {
    readBytes: (uri) => new File(uri).bytes(),
  });
}
