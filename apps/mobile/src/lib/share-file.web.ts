/**
 * The web build of the share step (RAPP-401): a browser has no share sheet
 * for files, so the file downloads, as on the web admin.
 */
import type { SharedFile } from './shared-file';

export function shareFile(shared: SharedFile): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([shared.content as BlobPart], { type: shared.mimeType }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = shared.name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return Promise.resolve();
}
